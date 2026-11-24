import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import SIGNAL_T, Base, IdMixin, Signal


class Printer(IdMixin, Base):
    __tablename__ = "printers"
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id"), index=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)       # "Gantry-02"
    bay: Mapped[str] = mapped_column(String(30))                      # "Bay 2"
    kind: Mapped[str] = mapped_column(String(20))                     # gantry | robot_arm
    nozzle: Mapped[str] = mapped_column(String(20), default="N2")
    nozzle_diameter_mm: Mapped[float] = mapped_column(Float, default=20.0)
    rpm_min: Mapped[float] = mapped_column(Float, default=5)
    rpm_max: Mapped[float] = mapped_column(Float, default=80)
    speed_min: Mapped[float] = mapped_column(Float, default=5)
    speed_max: Mapped[float] = mapped_column(Float, default=20)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    sensors: Mapped[list["Sensor"]] = relationship(back_populates="printer", cascade="all, delete-orphan")


class Sensor(IdMixin, Base):
    __tablename__ = "sensors"
    printer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("printers.id", ondelete="CASCADE"), index=True)
    signal: Mapped[Signal] = mapped_column(SIGNAL_T)
    label: Mapped[str] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="live")   # live | calibrating | offline
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    printer: Mapped[Printer] = relationship(back_populates="sensors")


class PrintJob(IdMixin, Base):
    __tablename__ = "print_jobs"
    name: Mapped[str] = mapped_column(String(120))                 # "Wall Panel WP-03"
    code: Mapped[str] = mapped_column(String(30), unique=True)     # "A-1027"
    total_layers: Mapped[int]
    mixture: Mapped[str] = mapped_column(String(30), default="PC42")
    print_speed_mm_s: Mapped[float] = mapped_column(Float, default=10.0)
    target_layer_width_mm: Mapped[float] = mapped_column(Float, default=19.5)
    width_tolerance_mm: Mapped[float] = mapped_column(Float, default=1.0)
    target_layer_height_mm: Mapped[float] = mapped_column(Float, default=15.7)
    height_tolerance_mm: Mapped[float] = mapped_column(Float, default=1.0)
    path_length_per_layer_mm: Mapped[float] = mapped_column(Float, default=960.0)
    default_interlayer_delay_min: Mapped[int] = mapped_column(default=5)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class SignalLimit(IdMixin, Base):
    """Normal/critical ranges per signal. job_id NULL = printer default."""
    __tablename__ = "signal_limits"
    __table_args__ = (UniqueConstraint("printer_id", "job_id", "signal", name="uq_signal_limits_scope"),)
    printer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("printers.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("print_jobs.id", ondelete="CASCADE"))
    signal: Mapped[Signal] = mapped_column(SIGNAL_T)
    normal_min: Mapped[float | None] = mapped_column(Float)
    normal_max: Mapped[float | None] = mapped_column(Float)
    critical_min: Mapped[float | None] = mapped_column(Float)
    critical_max: Mapped[float | None] = mapped_column(Float)
    rate_limit_per_min: Mapped[float | None] = mapped_column(Float)
