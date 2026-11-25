import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    pass


Base.metadata.naming_convention = NAMING


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def pg_enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x])


class UserRole(str, enum.Enum):
    operator = "operator"
    engineer = "engineer"
    admin = "admin"
    manager = "manager"
    lead = "lead"            # team lead: everything an engineer and an admin can do (Kasra, Carlos)


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    prechecking = "prechecking"
    running = "running"
    paused = "paused"
    stopped = "stopped"
    completed = "completed"
    aborted = "aborted"


class Signal(str, enum.Enum):
    """Signals measured or derived by PRIME (canonical units in docs/20)."""
    temperature = "temperature"            # material temperature, deg C
    pump_rpm = "pump_rpm"                  # extrusion rate, RPM
    motor_power = "motor_power"            # W = duty * voltage * current
    voltage = "voltage"                    # V
    current = "current"                    # A
    duty = "duty"                          # duty (%), signed
    print_speed = "print_speed"            # mm/s
    flow = "flow"                          # mm^3/s = speed * width * height
    sll_width = "sll_width"                # single-layer bead width, mm (vision)
    sll_height = "sll_height"              # single-layer height, mm (vision)
    total_height = "total_height"          # mm
    interlayer_delay = "interlayer_delay"  # min (setting) / class predicted by RF


class Severity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class AlertStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"


class AlertKind(str, enum.Enum):
    out_of_range = "out_of_range"
    predicted_out_of_range = "predicted_out_of_range"
    sensor_lost = "sensor_lost"
    rapid_change = "rapid_change"


class ModelTarget(str, enum.Enum):
    extrusion_rate = "extrusion_rate"
    interlayer_delay = "interlayer_delay"


class RecStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    modified = "modified"
    rejected = "rejected"
    expired = "expired"
    superseded = "superseded"


class AdjustParam(str, enum.Enum):
    pump_rpm = "pump_rpm"
    print_speed = "print_speed"
    interlayer_delay = "interlayer_delay"


class AdjustSource(str, enum.Enum):
    ai_accepted = "ai_accepted"
    ai_modified = "ai_modified"
    manual = "manual"


class ControlAction(str, enum.Enum):
    start = "start"
    pause = "pause"
    resume = "resume"
    stop = "stop"


class ValueSource(str, enum.Enum):
    recorded = "recorded"
    scenario_override = "scenario_override"
    adjusted = "adjusted"


class RejectReason(str, enum.Enum):
    sensor_artifact = "sensor_artifact"
    material_change = "material_change"
    disagree_model = "disagree_model"
    other = "other"


# Shared PostgreSQL enum types (define once, reuse in every table)
USER_ROLE_T = pg_enum(UserRole, "user_role")
SESSION_STATUS_T = pg_enum(SessionStatus, "session_status")
SIGNAL_T = pg_enum(Signal, "signal")
SEVERITY_T = pg_enum(Severity, "severity")
ALERT_STATUS_T = pg_enum(AlertStatus, "alert_status")
ALERT_KIND_T = pg_enum(AlertKind, "alert_kind")
MODEL_TARGET_T = pg_enum(ModelTarget, "model_target")
REC_STATUS_T = pg_enum(RecStatus, "rec_status")
ADJUST_PARAM_T = pg_enum(AdjustParam, "adjust_param")
ADJUST_SOURCE_T = pg_enum(AdjustSource, "adjust_source")
CONTROL_ACTION_T = pg_enum(ControlAction, "control_action")
VALUE_SOURCE_T = pg_enum(ValueSource, "value_source")
REJECT_REASON_T = pg_enum(RejectReason, "reject_reason")
