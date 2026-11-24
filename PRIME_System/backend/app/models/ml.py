"""Model versions, predictions, recommendations and adjustments."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (ADJUST_PARAM_T, ADJUST_SOURCE_T, MODEL_TARGET_T, REC_STATUS_T, REJECT_REASON_T,
                             VALUE_SOURCE_T, AdjustParam, AdjustSource, Base, IdMixin, ModelTarget, RecStatus,
                             RejectReason, ValueSource)


class ModelVersion(IdMixin, Base):
    __tablename__ = "model_versions"
    target: Mapped[ModelTarget] = mapped_column(MODEL_TARGET_T)
    algorithm: Mapped[str] = mapped_column(String(30))          # xgboost | random_forest
    kind: Mapped[str] = mapped_column(String(20))               # regression | classification
    file_name: Mapped[str] = mapped_column(String(120))
    sha256: Mapped[str] = mapped_column(String(64))
    feature_names: Mapped[list] = mapped_column(JSONB)
    classes: Mapped[list | None] = mapped_column(JSONB)
    trained_with: Mapped[dict | None] = mapped_column(JSONB)
    metrics: Mapped[dict | None] = mapped_column(JSONB)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Prediction(IdMixin, Base):
    __tablename__ = "predictions"
    __table_args__ = (Index("ix_predictions_session_target", "session_id", "target", "layer_no"),)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"))
    checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("checkpoints.id", ondelete="CASCADE"))
    layer_no: Mapped[int] = mapped_column(Integer)
    checkpoint_no: Mapped[int | None] = mapped_column(Integer)
    model_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("model_versions.id"))
    target: Mapped[ModelTarget] = mapped_column(MODEL_TARGET_T)
    predicted_value: Mapped[float] = mapped_column(Float)       # RPM, or delay class in minutes
    unit: Mapped[str] = mapped_column(String(10))
    lower: Mapped[float | None] = mapped_column(Float)
    upper: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)
    class_probabilities: Mapped[dict | None] = mapped_column(JSONB)   # RF: {"1":..,"5":..,"10":..}
    features: Mapped[dict] = mapped_column(JSONB)                     # snapshot incl. raw_model_output
    top_factors: Mapped[list | None] = mapped_column(JSONB)           # [{feature, value, contribution}]
    observed_value: Mapped[float | None] = mapped_column(Float)
    source: Mapped[ValueSource] = mapped_column(VALUE_SOURCE_T, default=ValueSource.recorded)


class Recommendation(IdMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        Index("uq_recommendations_pending", "session_id", "parameter", unique=True,
              postgresql_where=text("status = 'pending'")),
    )
    prediction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predictions.id", ondelete="CASCADE"))
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    parameter: Mapped[AdjustParam] = mapped_column(ADJUST_PARAM_T)
    current_value: Mapped[float] = mapped_column(Float)
    proposed_value: Mapped[float] = mapped_column(Float)
    reason_lines: Mapped[list] = mapped_column(JSONB)
    predicted_effect: Mapped[dict | None] = mapped_column(JSONB)
    risk_text: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[RecStatus] = mapped_column(REC_STATUS_T, default=RecStatus.pending)
    created_at_layer: Mapped[int] = mapped_column(Integer)
    expires_at_layer: Mapped[int] = mapped_column(Integer)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    final_value: Mapped[float | None] = mapped_column(Float)
    reject_reason: Mapped[RejectReason | None] = mapped_column(REJECT_REASON_T)
    reject_note: Mapped[str | None] = mapped_column(Text)


class Adjustment(IdMixin, Base):
    __tablename__ = "adjustments"
    __table_args__ = (
        CheckConstraint(
            "(recommendation_id IS NOT NULL AND source IN ('ai_accepted','ai_modified')) OR "
            "(recommendation_id IS NULL AND source = 'manual' AND note IS NOT NULL AND length(trim(note)) > 0)",
            name="source_matches_recommendation"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("print_sessions.id", ondelete="CASCADE"), index=True)
    parameter: Mapped[AdjustParam] = mapped_column(ADJUST_PARAM_T)
    from_value: Mapped[float] = mapped_column(Float)
    to_value: Mapped[float] = mapped_column(Float)
    source: Mapped[AdjustSource] = mapped_column(ADJUST_SOURCE_T)
    recommendation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("recommendations.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    requested_at_layer: Mapped[int] = mapped_column(Integer)
    applied_at_layer: Mapped[int | None] = mapped_column(Integer)
