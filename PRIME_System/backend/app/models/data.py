"""Datasets, print sessions, readings, layers, checkpoints and camera frames."""
import uuid
from datetime import datetime

from sqlalchemy import (BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SESSION_STATUS_T, VALUE_SOURCE_T, Base, IdMixin, SessionStatus, ValueSource


class Dataset(IdMixin, Base):
    """An imported recording (CSV/XLSX) that the replay engine can play back."""
    __tablename__ = "datasets"
    name: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    source_file: Mapped[str] = mapped_column(String(255))
    processed_file: Mapped[str] = mapped_column(String(255))
    mapping_file: Mapped[str | None] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20), default="stream")   # stream | checkpoints | lab_reference
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    layer_count: Mapped[int] = mapped_column(Integer, default=0)
    first_layer: Mapped[int] = mapped_column(Integer, default=1)
    duration_s: Mapped[int] = mapped_column(Integer, default=0)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


class PrintSession(IdMixin, Base):
    """One run of a job on a printer (live or replayed)."""
    __tablename__ = "print_sessions"
    __table_args__ = (
        # at most one active session per printer
        Index("uq_print_sessions_active_printer", "printer_id", unique=True,
              postgresql_where=text("status IN ('prechecking','running','paused')")),
    )
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_jobs.id"), index=True)
    printer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("printers.id"), index=True)
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("datasets.id"))
    branch_dataset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("datasets.id"))
    scenario_name: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[SessionStatus] = mapped_column(SESSION_STATUS_T, default=SessionStatus.scheduled)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_layer: Mapped[int] = mapped_column(Integer, default=0)
    current_rpm: Mapped[float | None] = mapped_column(Float)
    current_speed: Mapped[float | None] = mapped_column(Float)
    current_delay_min: Mapped[int | None] = mapped_column(Integer)
    replay_cursor: Mapped[int] = mapped_column(Integer, default=0)
    replay_speed: Mapped[float] = mapped_column(Float, default=10.0)
    sim_time_s: Mapped[float] = mapped_column(Float, default=0.0)
    operator_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    engineer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    quality_score: Mapped[float | None] = mapped_column(Float)
    last_seq: Mapped[int] = mapped_column(BigInteger, default=0)


class Reading(Base):
    """1 Hz telemetry. High volume: bigserial PK, no created_at."""
    __tablename__ = "readings"
    __table_args__ = (
        UniqueConstraint("session_id", "seq", name="uq_readings_session_seq"),
        Index("ix_readings_session_ts", "session_id", "ts"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"))
    seq: Mapped[int] = mapped_column(BigInteger)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sim_t_s: Mapped[float] = mapped_column(Float)
    layer: Mapped[int] = mapped_column(Integer)
    checkpoint: Mapped[int | None] = mapped_column(Integer)
    phase: Mapped[str] = mapped_column(String(20))               # printing | interlayer_delay
    temperature: Mapped[float | None] = mapped_column(Float)
    pump_rpm: Mapped[float | None] = mapped_column(Float)
    voltage: Mapped[float | None] = mapped_column(Float)
    current: Mapped[float | None] = mapped_column(Float)
    duty: Mapped[float | None] = mapped_column(Float)
    motor_power: Mapped[float | None] = mapped_column(Float)
    print_speed: Mapped[float | None] = mapped_column(Float)
    sll_width: Mapped[float | None] = mapped_column(Float)
    sll_height: Mapped[float | None] = mapped_column(Float)
    total_height: Mapped[float | None] = mapped_column(Float)
    flow: Mapped[float | None] = mapped_column(Float)
    delay_setting_min: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[ValueSource] = mapped_column(VALUE_SOURCE_T, default=ValueSource.recorded)


class Layer(IdMixin, Base):
    __tablename__ = "layers"
    __table_args__ = (UniqueConstraint("session_id", "layer_no", name="uq_layers_session_layer"),)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    layer_no: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    measured_width_mm: Mapped[float | None] = mapped_column(Float)
    measured_height_mm: Mapped[float | None] = mapped_column(Float)
    total_height_mm: Mapped[float | None] = mapped_column(Float)
    interlayer_delay_min: Mapped[int | None] = mapped_column(Integer)
    avg_rpm: Mapped[float | None] = mapped_column(Float)
    avg_speed: Mapped[float | None] = mapped_column(Float)
    avg_temperature: Mapped[float | None] = mapped_column(Float)
    avg_motor_power: Mapped[float | None] = mapped_column(Float)
    within_tolerance: Mapped[bool | None] = mapped_column(Boolean)


class Checkpoint(IdMixin, Base):
    """Vision measurement point along a layer (4 per layer, like raw.xlsx rows).
    Model inference runs per checkpoint."""
    __tablename__ = "checkpoints"
    __table_args__ = (UniqueConstraint("layer_id", "checkpoint_no", name="uq_checkpoints_layer_no"),)
    layer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("layers.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    checkpoint_no: Mapped[int] = mapped_column(Integer)
    ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sll_width_mm: Mapped[float] = mapped_column(Float)
    sll_height_mm: Mapped[float] = mapped_column(Float)
    temperature: Mapped[float] = mapped_column(Float)
    motor_power: Mapped[float] = mapped_column(Float)
    print_speed: Mapped[float] = mapped_column(Float)
    flow: Mapped[float] = mapped_column(Float)
    pump_rpm: Mapped[float] = mapped_column(Float)


class CameraFrame(IdMixin, Base):
    __tablename__ = "camera_frames"
    checkpoint_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("checkpoints.id", ondelete="CASCADE"), index=True)
    image_path: Mapped[str] = mapped_column(String(255))
    width_mm: Mapped[float | None] = mapped_column(Float)
    height_mm: Mapped[float | None] = mapped_column(Float)
    edge_polyline: Mapped[list | None] = mapped_column(JSONB)
    measurement_confidence: Mapped[float | None] = mapped_column(Float)
    flagged_artifact: Mapped[bool] = mapped_column(Boolean, default=False)
    flagged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
