"""Printers, sensors, jobs, print sessions and session control (US-03/04/07)."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.errors import APIError, not_found
from app.core.rbac import Permission, require
from app.db import get_db
from app.models import (Alert, AlertStatus, ControlAction, Dataset, Printer, PrintJob, PrintSession, Reading,
                        Sensor, SessionStatus, SignalLimit, User, UserRole)
from app.replay.manager import ACTIVE, manager
from app.replay.runner import load_rows
from app.schemas.common import (ControlIn, ControlOut, JobIn, JobOut, LimitOut, PrinterLive, PrinterOut,
                                SensorOut, SessionCreateIn, SessionDetail, SessionSummary)

router = APIRouter(tags=["printers & sessions"])
VIEW = require(Permission.view_live)


async def _summary(db: AsyncSession, s: PrintSession) -> SessionSummary:
    job = await db.get(PrintJob, s.job_id)
    printer = await db.get(Printer, s.printer_id)
    return SessionSummary.model_validate(s).model_copy(update={
        "job_name": job.name, "job_code": job.code, "total_layers": job.total_layers, "printer_name": printer.name})


# ---------------- printers ----------------
@router.get("/printers", response_model=list[PrinterLive])
async def printers(user: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    site_ids = None
    if user.role not in (UserRole.admin, UserRole.lead):
        me = await db.scalar(select(User).options(selectinload(User.sites)).where(User.id == user.id))
        site_ids = [s.id for s in me.sites]
    q = select(Printer).where(Printer.is_active.is_(True)).order_by(Printer.bay)
    if site_ids is not None:
        q = q.where(Printer.site_id.in_(site_ids))
    out = []
    for p in (await db.scalars(q)).all():
        active = await db.scalar(select(PrintSession).where(PrintSession.printer_id == p.id,
                                                            PrintSession.status.in_(ACTIVE)))
        if active is None:
            active = await db.scalar(select(PrintSession).where(
                PrintSession.printer_id == p.id, PrintSession.status == SessionStatus.scheduled)
                .order_by(PrintSession.created_at))
        sensors = (await db.scalars(select(Sensor).where(Sensor.printer_id == p.id))).all()
        out.append(PrinterLive(**PrinterOut.model_validate(p).model_dump(),
                               active_session=await _summary(db, active) if active else None,
                               sensors=[SensorOut.model_validate(x) for x in sensors]))
    return out


@router.get("/printers/{printer_id}/sensors", response_model=list[SensorOut])
async def printer_sensors(printer_id: uuid.UUID, _: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Sensor).where(Sensor.printer_id == printer_id).order_by(Sensor.label))).all()


@router.post("/printers/{printer_id}/sensors/test")
async def sensor_test(printer_id: uuid.UUID, request: Request, user: User = Depends(require(Permission.manage_sessions)),
                      db: AsyncSession = Depends(get_db)):
    """Onboarding 'Run 30-second test': replays 30 rows of the printer's next dataset and checks each sensor."""
    s = await db.scalar(select(PrintSession).where(PrintSession.printer_id == printer_id,
                                                   PrintSession.dataset_id.is_not(None))
                        .order_by(PrintSession.created_at.desc()))
    rows = load_rows((await db.get(Dataset, s.dataset_id)).processed_file)[:30] if s else []
    now = datetime.now(timezone.utc)
    results = []
    for sensor in (await db.scalars(select(Sensor).where(Sensor.printer_id == printer_id))).all():
        vals = [r.get(sensor.signal.value) for r in rows if r.get(sensor.signal.value) is not None]
        ok = len(vals) >= 25
        sensor.status, sensor.last_seen_at = ("live" if ok else "offline"), now
        results.append({"sensor_id": str(sensor.id), "label": sensor.label, "signal": sensor.signal.value,
                        "status": sensor.status, "samples": len(vals),
                        "last_value": round(vals[-1], 3) if vals else None, "unit": sensor.unit})
    audit(db, user.id, "printer.sensor_test", "printer", printer_id, request=request)
    if results and all(r["status"] == "live" for r in results):
        from app.gamification.service import award
        await award(db, user.id, "calibrated")
    await db.commit()
    return {"printer_id": str(printer_id), "passed": all(r["status"] == "live" for r in results), "sensors": results}


# ---------------- jobs ----------------
@router.get("/jobs", response_model=list[JobOut])
async def jobs(_: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(PrintJob).order_by(PrintJob.code))).all()


@router.post("/jobs", response_model=JobOut, status_code=201)
async def create_job(body: JobIn, request: Request, user: User = Depends(require(Permission.manage_sessions)),
                     db: AsyncSession = Depends(get_db)):
    if await db.scalar(select(PrintJob).where(PrintJob.code == body.code)):
        raise APIError(409, "CODE_TAKEN", "A job with this code already exists.")
    job = PrintJob(**body.model_dump(), created_by=user.id)
    db.add(job)
    await db.flush()
    audit(db, user.id, "job.create", "print_job", job.id, None, body.model_dump(), request)
    await db.commit()
    await db.refresh(job)
    return job


# ---------------- sessions ----------------
@router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(status: SessionStatus | None = None, printer_id: uuid.UUID | None = None,
                        _: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    q = select(PrintSession)
    if status:
        q = q.where(PrintSession.status == status)
    if printer_id:
        q = q.where(PrintSession.printer_id == printer_id)
    rows = (await db.scalars(q.order_by(PrintSession.created_at.desc()))).all()
    return [await _summary(db, s) for s in rows]


@router.post("/sessions", response_model=SessionSummary, status_code=201)
async def create_session(body: SessionCreateIn, request: Request,
                         user: User = Depends(require(Permission.manage_sessions)), db: AsyncSession = Depends(get_db)):
    for model, key in ((PrintJob, body.job_id), (Printer, body.printer_id), (Dataset, body.dataset_id)):
        if await db.get(model, key) is None:
            raise not_found(model.__name__)
    s = PrintSession(**body.model_dump(), status=SessionStatus.scheduled,
                     engineer_id=body.engineer_id or (user.id if user.role in (UserRole.engineer, UserRole.lead) else None))
    db.add(s)
    await db.flush()
    audit(db, user.id, "session.create", "print_session", s.id, None, body.model_dump(), request)
    await db.commit()
    await db.refresh(s)
    return await _summary(db, s)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(session_id: uuid.UUID, _: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    s = await db.get(PrintSession, session_id)
    if s is None:
        raise not_found("Session")
    job, printer = await db.get(PrintJob, s.job_id), await db.get(Printer, s.printer_id)
    lims = (await db.scalars(select(SignalLimit).where(SignalLimit.printer_id == s.printer_id,
                                                       (SignalLimit.job_id == s.job_id) | SignalLimit.job_id.is_(None))
                             .order_by(SignalLimit.job_id.nulls_first()))).all()
    merged = {lim.signal: lim for lim in lims}
    latest = await db.scalar(select(Reading).where(Reading.session_id == s.id, Reading.phase == "printing")
                             .order_by(Reading.seq.desc()).limit(1))
    open_alerts = await db.scalar(select(Alert.id).where(Alert.session_id == s.id,
                                                         Alert.status != AlertStatus.resolved).limit(1))
    base = (await _summary(db, s)).model_dump()
    pause_reason, auto_paused = None, False
    if s.status == SessionStatus.paused:
        from app.models import ControlEvent
        ev = await db.scalar(select(ControlEvent).where(ControlEvent.session_id == s.id)
                             .order_by(ControlEvent.at.desc()).limit(1))
        if ev is not None:
            pause_reason, auto_paused = ev.reason, ev.user_id is None
    return SessionDetail(**base, pause_reason=pause_reason, auto_paused=auto_paused, dataset_id=s.dataset_id, operator_id=s.operator_id, engineer_id=s.engineer_id,
                         replay_speed=s.replay_speed, sim_time_s=s.sim_time_s, last_seq=s.last_seq,
                         limits=[LimitOut(signal=x.signal, normal_min=x.normal_min, normal_max=x.normal_max,
                                          critical_min=x.critical_min, critical_max=x.critical_max)
                                 for x in merged.values()],
                         latest=None if latest is None else {
                             c: getattr(latest, c) for c in ("seq", "layer", "checkpoint", "phase", "temperature",
                                                             "pump_rpm", "voltage", "current", "duty", "motor_power",
                                                             "print_speed", "sll_width", "sll_height",
                                                             "total_height", "flow", "delay_setting_min")}
                         | {"has_open_alerts": open_alerts is not None},
                         job=JobOut.model_validate(job), printer=PrinterOut.model_validate(printer))


async def _control(session_id: uuid.UUID, action: ControlAction, body: ControlIn | None, user: User,
                   request: Request) -> ControlOut:
    t0 = time.perf_counter()
    s = await manager.control(session_id, action, user.id, body.reason if body else None, request)
    return ControlOut(session_id=s.id, status=s.status, action=action,
                      latency_ms=round((time.perf_counter() - t0) * 1000, 1))


CONTROL = require(Permission.control_session)


@router.post("/sessions/{session_id}/start", response_model=ControlOut)
async def start(session_id: uuid.UUID, request: Request, body: ControlIn | None = None, user: User = Depends(CONTROL)):
    return await _control(session_id, ControlAction.start, body, user, request)


@router.post("/sessions/{session_id}/pause", response_model=ControlOut)
async def pause(session_id: uuid.UUID, request: Request, body: ControlIn | None = None, user: User = Depends(CONTROL)):
    return await _control(session_id, ControlAction.pause, body, user, request)


@router.post("/sessions/{session_id}/resume", response_model=ControlOut)
async def resume(session_id: uuid.UUID, request: Request, body: ControlIn | None = None, user: User = Depends(CONTROL)):
    return await _control(session_id, ControlAction.resume, body, user, request)


@router.post("/sessions/{session_id}/stop", response_model=ControlOut)
async def stop(session_id: uuid.UUID, request: Request, body: ControlIn | None = None, user: User = Depends(CONTROL)):
    return await _control(session_id, ControlAction.stop, body, user, request)

