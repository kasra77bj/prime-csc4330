"""Readings history (Trends, US-08), layers/checkpoints (Vision, US-05) and the dashboard summary (T1.6)."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import Float, and_, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import APIError, not_found
from app.core.rbac import Permission, has_permission, require
from app.db import get_db
from app.models import (Alert, AlertStatus, CameraFrame, Checkpoint, Layer, PrintSession, Reading, Recommendation,
                        RecStatus, SessionStatus, User)
from app.replay.manager import ACTIVE

router = APIRouter(tags=["data"])
VIEW = require(Permission.view_live)
SERIES = ("temperature", "pump_rpm", "voltage", "current", "duty", "motor_power", "print_speed", "sll_width",
          "sll_height", "total_height", "flow", "delay_setting_min")
MAX_POINTS = 600


def _bucket_seconds(text: str | None, span_s: float) -> int:
    if text:
        t = text.strip().lower()
        mult = 60 if t.endswith("m") else 1
        try:
            return max(1, int(float(t.rstrip("sm")) * mult))
        except ValueError:
            raise APIError(422, "BAD_BUCKET", "bucket must look like '10s' or '1m'")
    return max(1, math.ceil(span_s / MAX_POINTS))


@router.get("/sessions/{session_id}/readings")
async def readings(session_id: uuid.UUID, signals: str = Query("sll_width,pump_rpm,temperature"),
                   from_s: float | None = None, to_s: float | None = None, last_s: float | None = None,
                   bucket: str | None = None, phase: str | None = "printing", raw: bool = False,
                   user: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    """Time series by simulated print time. Operators always get aggregated buckets; `raw=true` needs Engineer."""
    names = [s.strip() for s in signals.split(",") if s.strip()]
    bad = [n for n in names if n not in SERIES]
    if bad:
        raise APIError(422, "BAD_SIGNAL", f"Unknown signal(s): {', '.join(bad)}", {"allowed": list(SERIES)})
    s = await db.get(PrintSession, session_id)
    if s is None:
        raise not_found("Session")
    hi = to_s if to_s is not None else s.sim_time_s
    lo = from_s if from_s is not None else (hi - last_s if last_s is not None else 0.0)
    conds = [Reading.session_id == session_id, Reading.sim_t_s >= lo, Reading.sim_t_s <= hi]
    if phase:
        conds.append(Reading.phase == phase)
    if raw:
        if not has_permission(user.role, Permission.view_raw_data):
            raise APIError(403, "FORBIDDEN_ROLE", "Raw sensor data requires an engineer.",
                           {"required": "view_raw_data", "hint": "Engineer approval required"})
        rows = (await db.execute(select(Reading.seq, Reading.sim_t_s, Reading.ts, Reading.layer, Reading.phase,
                                        Reading.source, *[getattr(Reading, n) for n in names])
                                 .where(and_(*conds)).order_by(Reading.seq).limit(5000))).mappings().all()
        return {"bucket_s": None, "raw": True, "points": [dict(r) for r in rows]}
    b = _bucket_seconds(bucket, hi - lo)
    key = cast(func.floor(Reading.sim_t_s / b), Float).label("k")
    rows = (await db.execute(
        select(key, func.min(Reading.sim_t_s).label("t_s"), func.min(Reading.ts).label("ts"),
               func.max(Reading.layer).label("layer"),
               *[func.avg(getattr(Reading, n)).label(n) for n in names])
        .where(and_(*conds)).group_by(key).order_by(key))).mappings().all()
    pts = [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items() if k != "k"} for r in rows]
    return {"bucket_s": b, "raw": False, "from_s": lo, "to_s": hi, "points": pts}


@router.get("/sessions/{session_id}/layers")
async def layers(session_id: uuid.UUID, _: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    lays = (await db.scalars(select(Layer).where(Layer.session_id == session_id).order_by(Layer.layer_no))).all()
    cps = (await db.scalars(select(Checkpoint).where(Checkpoint.session_id == session_id)
                            .order_by(Checkpoint.ts))).all()
    by_layer: dict[uuid.UUID, list] = {}
    for c in cps:
        by_layer.setdefault(c.layer_id, []).append({
            "id": str(c.id), "checkpoint": c.checkpoint_no, "ts": c.ts, "sll_width_mm": c.sll_width_mm,
            "sll_height_mm": c.sll_height_mm, "temperature": c.temperature, "motor_power": abs(c.motor_power),
            "print_speed": c.print_speed, "flow": c.flow, "pump_rpm": c.pump_rpm})
    return [{"layer": x.layer_no, "started_at": x.started_at, "ended_at": x.ended_at,
             "measured_width_mm": x.measured_width_mm, "measured_height_mm": x.measured_height_mm,
             "total_height_mm": x.total_height_mm, "interlayer_delay_min": x.interlayer_delay_min,
             "avg_rpm": x.avg_rpm, "avg_temperature": x.avg_temperature, "avg_motor_power": abs(x.avg_motor_power) if x.avg_motor_power is not None else None,
             "within_tolerance": x.within_tolerance, "checkpoints": by_layer.get(x.id, [])} for x in lays]


@router.get("/sessions/{session_id}/layers/{layer_no}/frame")
async def layer_frame(session_id: uuid.UUID, layer_no: int, _: User = Depends(VIEW),
                      db: AsyncSession = Depends(get_db)):
    """Vision data for a layer: latest checkpoint measurements (the UI draws the overlay; images arrive in T3.1)."""
    lay = await db.scalar(select(Layer).where(Layer.session_id == session_id, Layer.layer_no == layer_no))
    if lay is None:
        raise not_found("Layer")
    cp = await db.scalar(select(Checkpoint).where(Checkpoint.layer_id == lay.id)
                         .order_by(Checkpoint.checkpoint_no.desc()).limit(1))
    if cp is None:
        raise not_found("Checkpoint")
    frame = await db.scalar(select(CameraFrame).where(CameraFrame.checkpoint_id == cp.id))
    return {"layer": layer_no, "checkpoint_id": str(cp.id), "checkpoint": cp.checkpoint_no,
            "width_mm": cp.sll_width_mm, "height_mm": cp.sll_height_mm, "image_url": None,
            "measurement_confidence": frame.measurement_confidence if frame else 0.93,
            "flagged_artifact": bool(frame and frame.flagged_artifact)}


@router.post("/checkpoints/{checkpoint_id}/flag-artifact")
async def flag_artifact(checkpoint_id: uuid.UUID, request: Request, user: User = Depends(require(Permission.flag_frame)),
                        db: AsyncSession = Depends(get_db)):
    cp = await db.get(Checkpoint, checkpoint_id)
    if cp is None:
        raise not_found("Checkpoint")
    frame = await db.scalar(select(CameraFrame).where(CameraFrame.checkpoint_id == cp.id))
    if frame is None:
        frame = CameraFrame(checkpoint_id=cp.id, image_path="", width_mm=cp.sll_width_mm, height_mm=cp.sll_height_mm,
                            measurement_confidence=0.93)
        db.add(frame)
    frame.flagged_artifact, frame.flagged_by = True, user.id
    audit(db, user.id, "frame.flag_artifact", "checkpoint", cp.id, request=request)
    await db.commit()
    return {"ok": True, "checkpoint_id": str(cp.id), "flagged_artifact": True}


@router.get("/dashboard/summary")
async def dashboard_summary(_: User = Depends(VIEW), db: AsyncSession = Depends(get_db)):
    active = (await db.scalars(select(PrintSession).where(PrintSession.status.in_(ACTIVE)))).all()
    ids = [s.id for s in active]
    open_alerts = (await db.scalars(select(Alert).where(Alert.status != AlertStatus.resolved,
                                                        Alert.session_id.in_(ids) if ids else False))).all()
    pending = await db.scalar(select(func.count()).select_from(Recommendation)
                              .where(Recommendation.status == RecStatus.pending)) or 0
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    scores = (await db.scalars(select(PrintSession.quality_score).where(
        PrintSession.quality_score.is_not(None),
        (PrintSession.status.in_(ACTIVE)) | ((PrintSession.status == SessionStatus.completed)
                                             & (PrintSession.ended_at >= today))))).all()
    return {"active_prints": len(active),
            "open_alerts": len(open_alerts),
            "open_alerts_by_severity": {sev: sum(1 for a in open_alerts if a.severity.value == sev)
                                        for sev in ("info", "warning", "critical")},
            "ai_suggestions_pending": int(pending),
            "shift_quality_score": round(sum(scores) / len(scores), 1) if scores else None}
