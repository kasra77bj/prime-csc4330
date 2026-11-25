"""Alerts center, acknowledge/resolve, and operator escalation (US-06, docs/17 sections 2-3)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import alert_dict
from app.core.audit import audit
from app.core.errors import APIError, not_found
from app.core.notify import notify
from app.core.rbac import Permission, require
from app.db import get_db
from app.models import (Alert, AlertStatus, Escalation, OnboardingProgress, Printer, PrintJob, PrintSession, Severity,
                        User, UserRole)
from app.schemas.common import AlertOut, EscalateIn, EscalateOut, UserOut
from app.ws.hub import hub

router = APIRouter(tags=["alerts"])
DEFAULT_RESPONSE_S = 120


async def _broadcast(db: AsyncSession, a: Alert) -> None:
    s = await db.get(PrintSession, a.session_id)
    p = await db.get(Printer, s.printer_id)
    for ch in (f"session:{a.session_id}", f"site:{p.site_id}"):
        await hub.publish(ch, "alert", alert_dict(a), session_id=str(a.session_id))


@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(status: AlertStatus | None = None, session_id: uuid.UUID | None = None,
                      severity: Severity | None = None, active: bool = False, limit: int = 100,
                      _: User = Depends(require(Permission.view_live)), db: AsyncSession = Depends(get_db)):
    q = select(Alert)
    if status:
        q = q.where(Alert.status == status)
    if session_id:
        q = q.where(Alert.session_id == session_id)
    if severity:
        q = q.where(Alert.severity == severity)
    if active:      # only prints that are still running/paused (the global critical banner)
        from app.replay.manager import ACTIVE
        q = q.where(Alert.session_id.in_(select(PrintSession.id).where(PrintSession.status.in_(ACTIVE))))
    rows = (await db.scalars(q.order_by(Alert.raised_at.desc()).limit(min(limit, 500)))).all()
    # context for the alerts center: which print, and who acknowledged
    sids = {a.session_id for a in rows}
    ctx = {sid: (job, printer) for sid, job, printer in (await db.execute(
        select(PrintSession.id, PrintJob.name, Printer.name).join(PrintJob, PrintJob.id == PrintSession.job_id)
        .join(Printer, Printer.id == PrintSession.printer_id).where(PrintSession.id.in_(sids)))).all()} if sids else {}
    uids = {a.acknowledged_by for a in rows if a.acknowledged_by}
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(uids)))).all()) if uids else {}
    return [AlertOut.model_validate(a).model_copy(update={
        "job_name": ctx.get(a.session_id, (None, None))[0], "printer_name": ctx.get(a.session_id, (None, None))[1],
        "acknowledged_by_name": names.get(a.acknowledged_by)}) for a in rows]


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge(alert_id: uuid.UUID, request: Request, user: User = Depends(require(Permission.acknowledge_alert)),
                      db: AsyncSession = Depends(get_db)):
    a = await db.get(Alert, alert_id)
    if a is None:
        raise not_found("Alert")
    if a.status == AlertStatus.resolved:
        raise APIError(409, "ALREADY_RESOLVED", "This alert is already resolved.")
    if a.status == AlertStatus.open:
        a.status, a.acknowledged_by, a.acknowledged_at = AlertStatus.acknowledged, user.id, datetime.now(timezone.utc)
        ob = await db.scalar(select(OnboardingProgress).where(OnboardingProgress.user_id == user.id))
        if ob is not None:
            ob.first_alert_ack = True
        from app.gamification.service import on_acknowledge
        await on_acknowledge(db, user.id, a)
        audit(db, user.id, "alert.acknowledge", "alert", a.id, request=request)
        await db.commit()
        await _broadcast(db, a)
    return a


@router.post("/alerts/{alert_id}/resolve", response_model=AlertOut)
async def resolve(alert_id: uuid.UUID, request: Request, user: User = Depends(require(Permission.resolve_alert)),
                  db: AsyncSession = Depends(get_db)):
    a = await db.get(Alert, alert_id)
    if a is None:
        raise not_found("Alert")
    if a.status != AlertStatus.resolved:
        a.status, a.resolved_at = AlertStatus.resolved, datetime.now(timezone.utc)
        audit(db, user.id, "alert.resolve", "alert", a.id, request=request)
        await db.commit()
        await _broadcast(db, a)
    return a


@router.post("/sessions/{session_id}/escalate", response_model=EscalateOut)
async def escalate(session_id: uuid.UUID, body: EscalateIn, request: Request,
                   user: User = Depends(require(Permission.escalate)), db: AsyncSession = Depends(get_db)):
    s = await db.get(PrintSession, session_id)
    if s is None:
        raise not_found("Session")
    engineer = await db.get(User, s.engineer_id) if s.engineer_id else None
    if engineer is None or not engineer.is_active:
        engineer = await db.scalar(select(User).where(User.role == UserRole.engineer, User.is_active.is_(True))
                                   .order_by(User.full_name))
    if engineer is None:
        raise APIError(409, "NO_ENGINEER", "No engineer is available to receive the escalation.")
    alert = await db.get(Alert, body.alert_id) if body.alert_id else None
    past = (await db.scalars(select(Escalation).where(Escalation.to_user_id == engineer.id,
                                                      Escalation.responded_at.is_not(None)))).all()
    waits = sorted((e.responded_at - e.created_at).total_seconds() for e in past)
    typical = int(waits[len(waits) // 2]) if waits else DEFAULT_RESPONSE_S
    esc = Escalation(alert_id=alert.id if alert else None, session_id=s.id, from_user_id=user.id,
                     to_user_id=engineer.id, message=body.message)
    db.add(esc)
    await db.flush()
    from app.alerts.engine import LABELS
    what = LABELS[alert.signal][0].lower() if alert and alert.signal in LABELS else "the live print"
    title = f"{user.full_name} needs you: {what}"
    await notify(db, engineer.id, "escalation", title, body.message or (alert.message if alert else None),
                 f"/prints/{s.id}/ai", {"escalation_id": str(esc.id), "session_id": str(s.id)})
    from app.gamification.service import on_escalate
    await on_escalate(db, user.id, s.id)
    audit(db, user.id, "session.escalate", "escalation", esc.id, None,
          {"to": engineer.id, "alert_id": alert.id if alert else None}, request)
    await db.commit()
    mins = max(1, round(typical / 60))
    return EscalateOut(escalation_id=esc.id, engineer=UserOut.model_validate(engineer), typical_response_s=typical,
                       message=f"{engineer.full_name} (Engineer) was notified · usually responds in ~{mins} min.")


@router.post("/sessions/{session_id}/escalations/seen")
async def escalations_seen(session_id: uuid.UUID, request: Request,
                           user: User = Depends(require(Permission.decide_recommendation)),
                           db: AsyncSession = Depends(get_db)):
    """The engineer opened the AI page: open escalations count as answered and the operator hears
    "<engineer> is reviewing" (docs/17 section 3)."""
    now = datetime.now(timezone.utc)
    open_ = (await db.scalars(select(Escalation).where(Escalation.session_id == session_id,
                                                       Escalation.responded_at.is_(None)))).all()
    for esc in open_:
        esc.seen_at = esc.seen_at or now
        esc.responded_at = now
    for uid in {e.from_user_id for e in open_}:
        await notify(db, uid, "escalation", f"{user.full_name.split()[0]} is reviewing",
                     f"{user.full_name} (Engineer) opened the AI suggestions for your print.",
                     f"/prints/{session_id}/live")
    if open_:
        audit(db, user.id, "escalation.seen", "print_session", session_id, None, {"count": len(open_)}, request)
    await db.commit()
    return {"answered": len(open_)}
