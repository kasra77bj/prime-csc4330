"""Alerts, escalations, control events, notifications, reports, gamification."""
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (ALERT_KIND_T, ALERT_STATUS_T, CONTROL_ACTION_T, SEVERITY_T, SIGNAL_T, AlertKind,
                             AlertStatus, Base, ControlAction, IdMixin, Severity, Signal)


class Alert(IdMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("uq_alerts_open_per_signal", "session_id", "signal", "kind", unique=True,
              postgresql_where=text("status = 'open'")),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    layer_no: Mapped[int] = mapped_column(Integer)
    signal: Mapped[Signal] = mapped_column(SIGNAL_T)
    kind: Mapped[AlertKind] = mapped_column(ALERT_KIND_T)
    severity: Mapped[Severity] = mapped_column(SEVERITY_T)
    message: Mapped[str] = mapped_column(Text)
    value: Mapped[float | None] = mapped_column(Float)
    threshold: Mapped[float | None] = mapped_column(Float)
    status: Mapped[AlertStatus] = mapped_column(ALERT_STATUS_T, default=AlertStatus.open)
    raised_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    prediction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("predictions.id", ondelete="SET NULL"))


class Escalation(IdMixin, Base):
    __tablename__ = "escalations"
    alert_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("alerts.id", ondelete="SET NULL"))
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    message: Mapped[str | None] = mapped_column(Text)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ControlEvent(IdMixin, Base):
    __tablename__ = "control_events"
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    action: Mapped[ControlAction] = mapped_column(CONTROL_ACTION_T)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    layer_no: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text)


class Notification(IdMixin, Base):
    __tablename__ = "notifications"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))   # alert|escalation|recommendation|nudge|badge|report_ready
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(255))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SessionReport(IdMixin, Base):
    __tablename__ = "session_reports"
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), unique=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    kpis: Mapped[dict] = mapped_column(JSONB)
    summary_text: Mapped[str] = mapped_column(Text)
    parameters_table: Mapped[list | None] = mapped_column(JSONB)


class Badge(IdMixin, Base):
    __tablename__ = "badges"
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(40))
    threshold: Mapped[int] = mapped_column(Integer, default=1)


class UserBadge(IdMixin, Base):
    __tablename__ = "user_badges"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    badge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("badges.id", ondelete="CASCADE"))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    earned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OnboardingProgress(IdMixin, Base):
    __tablename__ = "onboarding_progress"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    welcome_done: Mapped[bool] = mapped_column(Boolean, default=False)
    role_seen: Mapped[bool] = mapped_column(Boolean, default=False)
    tour_done: Mapped[bool] = mapped_column(Boolean, default=False)
    practice_stop_done: Mapped[bool] = mapped_column(Boolean, default=False)
    first_live_watched: Mapped[bool] = mapped_column(Boolean, default=False)
    first_alert_ack: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)


class ShiftGoal(IdMixin, Base):
    __tablename__ = "shift_goals"
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"))
    shift_label: Mapped[str] = mapped_column(String(20))
    date: Mapped[date] = mapped_column(Date)
    goal_text: Mapped[str] = mapped_column(String(200))
    target: Mapped[int] = mapped_column(Integer)
    progress: Mapped[int] = mapped_column(Integer, default=0)
