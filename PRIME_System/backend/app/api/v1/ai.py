"""AI endpoints: predictions, recommendations (accept/modify/reject), manual adjustments, model info
(US-09, US-10, US-11; docs/12 section 5)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import APIError, not_found
from app.core.rbac import Permission, require
from app.db import get_db
from app.ml.recommend import decide, publish_rec, rec_dict
from app.models import (AdjustParam, Adjustment, AdjustSource, ModelTarget, ModelVersion, Prediction, Printer,
                        PrintSession, Recommendation, RecStatus, RejectReason, User)
from app.replay.manager import ACTIVE, manager
from app.ws.hub import hub

router = APIRouter(tags=["ai"])
DECIDE = require(Permission.decide_recommendation)


class ModifyIn(BaseModel):
    final_value: float
    note: str | None = None


class RejectIn(BaseModel):
    reason: RejectReason
    note: str | None = None


class AcceptIn(BaseModel):
    note: str | None = None


class ManualIn(BaseModel):
    parameter: AdjustParam
    to_value: float
    note: str = Field(min_length=3, max_length=500)


def adj_dict(a: Adjustment, user_name: str | None = None) -> dict:
    return {"id": str(a.id), "session_id": str(a.session_id), "parameter": a.parameter.value,
            "from_value": a.from_value, "to_value": a.to_value, "source": a.source.value,
            "recommendation_id": str(a.recommendation_id) if a.recommendation_id else None,
            "user_id": str(a.user_id), "user_name": user_name, "note": a.note,
            "requested_at_layer": a.requested_at_layer, "applied_at_layer": a.applied_at_layer,
            "created_at": a.created_at.isoformat() if a.created_at else None}


def _limits(param: AdjustParam, printer: Printer) -> tuple[float, float]:
    if param == AdjustParam.pump_rpm:
        return printer.rpm_min, printer.rpm_max
    if param == AdjustParam.print_speed:
        return printer.speed_min, printer.speed_max
    return 1, 10


@router.get("/sessions/{session_id}/predictions")
async def predictions(session_id: uuid.UUID, target: ModelTarget | None = None, from_layer: int = 0,
                      limit: int = 400, _: User = Depends(require(Permission.view_live)),
                      db: AsyncSession = Depends(get_db)):
    q = select(Prediction).where(Prediction.session_id == session_id, Prediction.layer_no >= from_layer)
    if target:
        q = q.where(Prediction.target == target)
    rows = (await db.scalars(q.order_by(Prediction.layer_no.desc(), Prediction.checkpoint_no.desc())
                             .limit(min(limit, 2000)))).all()
    return [{"id": str(p.id), "target": p.target.value, "layer": p.layer_no, "checkpoint": p.checkpoint_no,
             "value": p.predicted_value, "unit": p.unit, "lower": p.lower, "upper": p.upper,
             "confidence": p.confidence, "class_probabilities": p.class_probabilities, "observed": p.observed_value,
             "top_factors": p.top_factors, "created_at": p.created_at} for p in reversed(rows)]


@router.get("/sessions/{session_id}/recommendations")
async def recommendations(session_id: uuid.UUID, status: RecStatus | None = None,
                          _: User = Depends(require(Permission.view_live)), db: AsyncSession = Depends(get_db)):
    q = select(Recommendation).where(Recommendation.session_id == session_id)
    if status:
        q = q.where(Recommendation.status == status)
    return [rec_dict(r) for r in (await db.scalars(q.order_by(Recommendation.created_at.desc()))).all()]


async def _decide(rec_id: uuid.UUID, action: str, user: User, db: AsyncSession, request: Request, **kw) -> dict:
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise not_found("Recommendation")
    s = await db.get(PrintSession, rec.session_id)
    if s.status not in ACTIVE:
        raise APIError(409, "SESSION_NOT_ACTIVE", "The print is no longer running.")
    printer = await db.get(Printer, s.printer_id)
    runner = manager.get(rec.session_id)
    adj = await decide(db, rec, user, action, runner, request=request, limits=_limits(rec.parameter, printer), **kw)
    await db.commit()
    await db.refresh(rec)
    await publish_rec(rec, printer.site_id)
    out = {"recommendation": rec_dict(rec)}
    if adj is not None:
        out["adjustment"] = adj_dict(adj, user.full_name)
        await hub.publish(f"session:{rec.session_id}", "adjustment", {**out["adjustment"], "status": "queued"},
                          session_id=str(rec.session_id))
    return out


@router.post("/recommendations/{rec_id}/accept")
async def accept(rec_id: uuid.UUID, request: Request, body: AcceptIn | None = None, user: User = Depends(DECIDE),
                 db: AsyncSession = Depends(get_db)):
    return await _decide(rec_id, "accept", user, db, request, note=body.note if body else None)


@router.post("/recommendations/{rec_id}/modify")
async def modify(rec_id: uuid.UUID, body: ModifyIn, request: Request, user: User = Depends(DECIDE),
                 db: AsyncSession = Depends(get_db)):
    return await _decide(rec_id, "modify", user, db, request, final_value=body.final_value, note=body.note)


@router.post("/recommendations/{rec_id}/reject")
async def reject(rec_id: uuid.UUID, body: RejectIn, request: Request, user: User = Depends(DECIDE),
                 db: AsyncSession = Depends(get_db)):
    return await _decide(rec_id, "reject", user, db, request, reason=body.reason, note=body.note)


@router.post("/sessions/{session_id}/adjustments", status_code=201)
async def manual_adjustment(session_id: uuid.UUID, body: ManualIn, request: Request,
                            user: User = Depends(require(Permission.manual_adjust)),
                            db: AsyncSession = Depends(get_db)):
    """US-11: adjust without (or against) the AI; always logged as an independent engineer decision."""
    s = await db.get(PrintSession, session_id)
    if s is None:
        raise not_found("Session")
    if s.status not in ACTIVE:
        raise APIError(409, "SESSION_NOT_ACTIVE", "The print is no longer running.")
    printer = await db.get(Printer, s.printer_id)
    lo, hi = _limits(body.parameter, printer)
    if not (lo <= body.to_value <= hi):
        raise APIError(422, "OUT_OF_LIMITS", f"Value must be between {lo:g} and {hi:g}.")
    if body.parameter == AdjustParam.interlayer_delay and body.to_value not in (1, 5, 10):
        raise APIError(422, "BAD_DELAY", "Interlayer delay must be 1, 5 or 10 minutes.")
    runner = manager.get(session_id)
    current = {AdjustParam.pump_rpm: s.current_rpm, AdjustParam.print_speed: s.current_speed,
               AdjustParam.interlayer_delay: s.current_delay_min}[body.parameter] or 0.0
    layer = runner.layer if runner else s.current_layer
    adj = Adjustment(session_id=s.id, parameter=body.parameter, from_value=float(current), to_value=body.to_value,
                     source=AdjustSource.manual, user_id=user.id, note=body.note, requested_at_layer=layer)
    db.add(adj)
    await db.flush()
    # an engineer decision overrides a pending AI suggestion for the same parameter
    pending = await db.scalar(select(Recommendation).where(Recommendation.session_id == s.id,
                                                           Recommendation.parameter == body.parameter,
                                                           Recommendation.status == RecStatus.pending))
    if pending is not None:
        pending.status = RecStatus.superseded
    audit(db, user.id, "adjustment.manual", "adjustment", adj.id, {"value": current},
          {"value": body.to_value, "note": body.note}, request)
    await db.commit()
    if runner is not None:
        runner.queue_adjustment(body.parameter.value, body.to_value, adj.id, layer)
    data = adj_dict(adj, user.full_name)
    await hub.publish(f"session:{s.id}", "adjustment", {**data, "status": "queued"}, session_id=str(s.id))
    if pending is not None:
        await publish_rec(pending, printer.site_id)
    return data


@router.get("/sessions/{session_id}/adjustments")
async def adjustments(session_id: uuid.UUID, _: User = Depends(require(Permission.view_live)),
                      db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Adjustment, User.full_name).join(User, User.id == Adjustment.user_id)
                             .where(Adjustment.session_id == session_id)
                             .order_by(Adjustment.created_at))).all()
    return [adj_dict(a, name) for a, name in rows]


@router.get("/models")
async def models(_: User = Depends(require(Permission.view_raw_data)), db: AsyncSession = Depends(get_db)):
    from app.ml.registry import get_registry
    reg = get_registry()
    out = []
    for mv in (await db.scalars(select(ModelVersion).order_by(ModelVersion.target))).all():
        out.append({"id": str(mv.id), "target": mv.target.value, "algorithm": mv.algorithm, "kind": mv.kind,
                    "file_name": mv.file_name, "sha256": mv.sha256, "feature_names": mv.feature_names,
                    "classes": mv.classes, "trained_with": mv.trained_with, "metrics": mv.metrics,
                    "is_active": mv.is_active, "loaded": True})
    return {"models": out, "feature_formulas": reg.config["features"]}
