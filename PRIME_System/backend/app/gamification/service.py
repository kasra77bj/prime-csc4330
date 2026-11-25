"""Badges, shift summary and team shift goal (docs/17 section 8, docs/06 part C, task T3.7).

Guardrail: rewards attention and quality, never speed; no individual leaderboards.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notify import notify
from app.models import (Alert, AlertKind, AlertStatus, Badge, Layer, PrintSession, Recommendation, RecStatus,
                        SessionStatus, Severity, ShiftGoal, UserBadge)

FIRST_CATCH_S = 15
GOAL_QUALITY = 90
TZ = ZoneInfo("America/Chicago")


def shift_start(now: datetime | None = None) -> datetime:
    """Start of today's shift window (local midnight, America/Chicago), in UTC."""
    local = (now or datetime.now(timezone.utc)).astimezone(TZ)
    return datetime.combine(local.date(), time.min, TZ).astimezone(timezone.utc)


def local_today() -> date:
    return datetime.now(timezone.utc).astimezone(TZ).date()


async def award(db: AsyncSession, user_id: uuid.UUID | None, code: str, inc: int = 1,
                progress: int | None = None) -> bool:
    """Adds progress to a badge (or sets it); earns it at its threshold. Returns True when newly earned."""
    if user_id is None:
        return False
    badge = await db.scalar(select(Badge).where(Badge.code == code))
    if badge is None:
        return False
    ub = await db.scalar(select(UserBadge).where(UserBadge.user_id == user_id, UserBadge.badge_id == badge.id))
    if ub is None:
        ub = UserBadge(user_id=user_id, badge_id=badge.id, progress=0)
        db.add(ub)
    if ub.earned_at is not None:
        return False
    # `progress` is a best-so-far value (e.g. the longest clean streak); `inc` adds one more event
    ub.progress = max(ub.progress or 0, progress) if progress is not None else (ub.progress or 0) + inc
    if ub.progress < badge.threshold:
        await db.flush()
        return False
    ub.progress, ub.earned_at = badge.threshold, datetime.now(timezone.utc)
    await db.flush()
    await notify(db, user_id, "badge", f"New badge: {badge.name}", badge.description, "/me/achievements",
                 {"badge": code})
    return True


async def on_acknowledge(db: AsyncSession, user_id: uuid.UUID, a: Alert) -> None:
    if a.acknowledged_at and (a.acknowledged_at - a.raised_at).total_seconds() <= FIRST_CATCH_S:
        await award(db, user_id, "first_catch")


async def on_escalate(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
    """Early Bird: escalated a predicted issue before it became a defect (no warning/critical out-of-range
    alert open yet, but the AI already flagged something)."""
    defect = await db.scalar(select(Alert.id).where(
        Alert.session_id == session_id, Alert.status != AlertStatus.resolved,
        Alert.kind.in_((AlertKind.out_of_range, AlertKind.sensor_lost)),
        Alert.severity.in_((Severity.warning, Severity.critical))).limit(1))
    predicted = await db.scalar(select(Recommendation.id).where(
        Recommendation.session_id == session_id, Recommendation.status == RecStatus.pending).limit(1)) or \
        await db.scalar(select(Alert.id).where(Alert.session_id == session_id, Alert.status != AlertStatus.resolved,
                                               Alert.kind == AlertKind.predicted_out_of_range).limit(1))
    if defect is None and predicted is not None:
        await award(db, user_id, "early_bird")


async def operator_streak(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Consecutive in-tolerance layers across the sessions this person operated (latest first)."""
    flags = (await db.scalars(select(Layer.within_tolerance).join(PrintSession, PrintSession.id == Layer.session_id)
                              .where(PrintSession.operator_id == user_id, Layer.within_tolerance.is_not(None))
                              .order_by(PrintSession.started_at.desc().nulls_last(), Layer.layer_no.desc())
                              .limit(500))).all()
    n = 0
    for f in flags:
        if not f:
            break
        n += 1
    return n


async def on_session_end(db: AsyncSession, s: PrintSession, score: float) -> None:
    """Steady Hands progress for the operator; a completed print with quality >= 90 counts toward the goal."""
    if s.operator_id:
        await award(db, s.operator_id, "steady_hands", progress=await operator_streak(db, s.operator_id))
    if s.status == SessionStatus.completed and score >= GOAL_QUALITY and s.ended_at and s.ended_at >= shift_start():
        from app.models import Printer
        printer = await db.get(Printer, s.printer_id)
        goal = await db.scalar(select(ShiftGoal).where(ShiftGoal.site_id == printer.site_id,
                                                       ShiftGoal.date == local_today()))
        if goal is not None:
            goal.progress = min(goal.target, goal.progress + 1)


async def shift_goal(db: AsyncSession, site_id: uuid.UUID | None) -> dict | None:
    if site_id is None:
        return None
    g = await db.scalar(select(ShiftGoal).where(ShiftGoal.site_id == site_id)
                        .order_by(ShiftGoal.date.desc()).limit(1))
    if g is None:
        return None
    return {"id": str(g.id), "shift_label": g.shift_label, "date": g.date.isoformat(), "goal_text": g.goal_text,
            "target": g.target, "progress": g.progress}


async def achievements(db: AsyncSession, user_id: uuid.UUID, site_id: uuid.UUID | None) -> dict:
    start = shift_start()
    badges = (await db.execute(select(Badge, UserBadge).outerjoin(
        UserBadge, (UserBadge.badge_id == Badge.id) & (UserBadge.user_id == user_id)).order_by(Badge.name))).all()
    mine = select(PrintSession.id).where((PrintSession.operator_id == user_id) |
                                         (PrintSession.engineer_id == user_id))
    layers = await db.scalar(select(func.count()).select_from(Layer).where(
        Layer.session_id.in_(mine), Layer.ended_at >= start)) or 0
    acked = (await db.execute(select(Alert.raised_at, Alert.acknowledged_at).where(
        Alert.acknowledged_by == user_id, Alert.acknowledged_at >= start))).all()
    waits = [(b - a).total_seconds() for a, b in acked]
    prevented = await db.scalar(select(func.count()).select_from(Alert).where(
        Alert.session_id.in_(mine), Alert.severity == Severity.warning,
        Alert.status == AlertStatus.resolved, Alert.raised_at >= start)) or 0
    out = [{"code": b.code, "name": b.name, "description": b.description, "icon": b.icon,
            "threshold": b.threshold, "progress": ub.progress if ub else 0,
            "earned_at": ub.earned_at.isoformat() if ub and ub.earned_at else None} for b, ub in badges]
    return {
        "badges": out,
        "earned": sum(1 for b in out if b["earned_at"]),
        "streak": await operator_streak(db, user_id),
        "shift": {"since": start.isoformat(), "layers_monitored": layers, "alerts_handled": len(waits),
                  "avg_response_s": round(sum(waits) / len(waits), 1) if waits else None,
                  "defects_prevented": prevented,
                  "badges_earned": [b["name"] for b in out if b["earned_at"] and b["earned_at"] >= start.isoformat()]},
        "goal": await shift_goal(db, site_id),
    }
