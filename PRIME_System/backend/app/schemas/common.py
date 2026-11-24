"""Pydantic v2 request/response schemas for Phase 1 endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (AlertKind, AlertStatus, ControlAction, SessionStatus, Severity, Signal, UserRole)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------- auth ----------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str
    remember_device: bool = False


class LoginOut(BaseModel):
    mfa_required: bool
    enroll_required: bool = False
    mfa_token: str | None = None
    access_token: str | None = None
    user: UserOut | None = None


class MfaVerifyIn(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=8)


class EnrollIn(BaseModel):
    mfa_token: str


class EnrollOut(BaseModel):
    otpauth_uri: str
    qr_svg: str
    secret: str


class EnrollConfirmIn(BaseModel):
    mfa_token: str
    code: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------- users / sites ----------------
class SiteOut(ORM):
    id: uuid.UUID
    name: str
    timezone: str


class UserOut(ORM):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    mfa_enrolled: bool
    is_active: bool
    last_login_at: datetime | None = None


class MeOut(UserOut):
    permissions: list[str]
    sites: list[SiteOut]
    onboarding: dict


class UserCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    role: UserRole
    site_ids: list[uuid.UUID] = []


class UserCreateOut(BaseModel):
    user: UserOut
    temporary_password: str
    note: str = "Shown once. The user must set up 2-factor authentication at first sign-in."


class UserPatchIn(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    site_ids: list[uuid.UUID] | None = None


class OnboardingPatch(BaseModel):
    welcome_done: bool | None = None
    role_seen: bool | None = None
    tour_done: bool | None = None
    practice_stop_done: bool | None = None
    first_live_watched: bool | None = None
    first_alert_ack: bool | None = None
    dismissed: bool | None = None


# ---------------- equipment / jobs ----------------
class SensorOut(ORM):
    id: uuid.UUID
    signal: Signal
    label: str
    unit: str
    status: str
    last_seen_at: datetime | None = None


class PrinterOut(ORM):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    bay: str
    kind: str
    nozzle: str
    rpm_min: float
    rpm_max: float
    speed_min: float
    speed_max: float


class PrinterLive(PrinterOut):
    active_session: SessionSummary | None = None
    sensors: list[SensorOut] = []


class JobIn(BaseModel):
    name: str
    code: str
    total_layers: int = Field(gt=0, le=500)
    mixture: str = "PC42"
    print_speed_mm_s: float = 10.0
    target_layer_width_mm: float = 19.5
    width_tolerance_mm: float = 1.0
    target_layer_height_mm: float = 15.7
    height_tolerance_mm: float = 1.0
    path_length_per_layer_mm: float = 960.0
    default_interlayer_delay_min: int = 5


class JobOut(ORM, JobIn):
    id: uuid.UUID
    created_at: datetime


# ---------------- sessions ----------------
class SessionCreateIn(BaseModel):
    job_id: uuid.UUID
    printer_id: uuid.UUID
    dataset_id: uuid.UUID
    scenario_name: str | None = None
    operator_id: uuid.UUID | None = None
    engineer_id: uuid.UUID | None = None


class SessionSummary(ORM):
    id: uuid.UUID
    job_id: uuid.UUID
    printer_id: uuid.UUID
    status: SessionStatus
    scenario_name: str | None
    started_at: datetime | None
    ended_at: datetime | None
    current_layer: int
    current_rpm: float | None
    current_speed: float | None
    current_delay_min: int | None
    quality_score: float | None
    job_name: str | None = None
    job_code: str | None = None
    total_layers: int | None = None
    printer_name: str | None = None


class LimitOut(BaseModel):
    signal: Signal
    normal_min: float | None
    normal_max: float | None
    critical_min: float | None
    critical_max: float | None


class SessionDetail(SessionSummary):
    dataset_id: uuid.UUID | None
    operator_id: uuid.UUID | None
    engineer_id: uuid.UUID | None
    replay_speed: float
    sim_time_s: float
    last_seq: int
    limits: list[LimitOut] = []
    latest: dict | None = None
    job: JobOut | None = None
    printer: PrinterOut | None = None


class ControlIn(BaseModel):
    reason: str | None = None


class ControlOut(BaseModel):
    session_id: uuid.UUID
    status: SessionStatus
    action: ControlAction
    latency_ms: float


# ---------------- alerts / escalation ----------------
class AlertOut(ORM):
    id: uuid.UUID
    session_id: uuid.UUID
    layer_no: int
    signal: Signal
    kind: AlertKind
    severity: Severity
    message: str
    value: float | None
    threshold: float | None
    status: AlertStatus
    raised_at: datetime
    acknowledged_by: uuid.UUID | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None


class EscalateIn(BaseModel):
    alert_id: uuid.UUID | None = None
    message: str | None = None


class EscalateOut(BaseModel):
    escalation_id: uuid.UUID
    engineer: UserOut
    typical_response_s: int
    message: str


class NotificationOut(ORM):
    id: uuid.UUID
    kind: str
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime


LoginOut.model_rebuild()
TokenOut.model_rebuild()
PrinterLive.model_rebuild()
