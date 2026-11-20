"""Runs both models on every closed vision checkpoint (task T2.1) and feeds the recommendation engine.

Registered via RUNNER_SETUP_HOOKS so the replay engine stays independent of ML.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy import select

from app.ml.recommend import RecommendationEngine
from app.ml.registry import get_registry
from app.models import Checkpoint, ModelTarget, ModelVersion, Prediction, ValueSource
from app.replay.manager import RUNNER_SETUP_HOOKS
from app.ws.hub import hub

log = logging.getLogger("prime.ml")


def _top(contrib: dict[str, float], values: dict[str, float]) -> list[dict]:
    return [{"feature": f, "value": round(values[f], 4), "contribution": round(c, 4)}
            for f, c in sorted(contrib.items(), key=lambda kv: -abs(kv[1]))]


def _xgb_confidence(history: list[float], current: float, out_of_range: list[str]) -> float:
    """Stability-based confidence: steady predictions across checkpoints -> high confidence (docs/20 section 5)."""
    jitter = abs(current - history[-1]) if history else 2.0
    conf = 0.95 - 0.03 * min(jitter, 8) - 0.15 * len(out_of_range)
    return round(max(0.5, min(0.97, conf)), 3)


async def on_checkpoint(runner, db, cp: Checkpoint) -> None:
    reg = get_registry()
    st = runner.ml_state
    if "versions" not in st:
        st["versions"] = {mv.target: mv.id for mv in (await db.scalars(
            select(ModelVersion).where(ModelVersion.is_active.is_(True)))).all()}
    values = {"Flow": cp.flow, "Motor Power": cp.motor_power, "Temperature (C)": cp.temperature}
    ext, dly = await asyncio.to_thread(reg.predict, cp.flow, cp.motor_power, cp.temperature)
    layer, cp_no = runner.layer, cp.checkpoint_no
    oor = reg.out_of_training_range(values)
    hist = [p[2] for p in st["ext"] if p[0] == layer]
    xconf = _xgb_confidence(hist, ext.rpm, oor)
    band = max(1.5, abs(ext.rpm - hist[-1])) if hist else 2.0
    delay_setting = (runner.last_row or {}).get("delay_setting_min") or runner.job.default_interlayer_delay_min
    feats = {**values, "out_of_training_range": oor}
    p_ext = Prediction(id=uuid.uuid4(), session_id=runner.session_id, checkpoint_id=cp.id, layer_no=layer,
                       checkpoint_no=cp_no, model_version_id=st["versions"][ModelTarget.extrusion_rate],
                       target=ModelTarget.extrusion_rate, predicted_value=round(ext.rpm, 2), unit="RPM",
                       lower=round(ext.rpm - band, 2), upper=round(ext.rpm + band, 2), confidence=xconf,
                       features={**feats, "raw_model_output": ext.rpm, "shap_base_value": ext.base_value},
                       top_factors=_top(ext.contributions, values), observed_value=cp.pump_rpm,
                       source=ValueSource.recorded)
    p_dly = Prediction(id=uuid.uuid4(), session_id=runner.session_id, checkpoint_id=cp.id, layer_no=layer,
                       checkpoint_no=cp_no, model_version_id=st["versions"][ModelTarget.interlayer_delay],
                       target=ModelTarget.interlayer_delay, predicted_value=float(dly.minutes), unit="min",
                       confidence=round(max(dly.probabilities.values()), 3), class_probabilities=dly.probabilities,
                       features={**feats, "raw_model_output": dly.probabilities},
                       top_factors=_top(dly.contributions, values), observed_value=float(delay_setting),
                       source=ValueSource.recorded)
    db.add_all([p_ext, p_dly])
    await db.flush()
    st["ext"].append((layer, cp_no, ext.rpm))
    st["dly"].append((layer, cp_no, dly.minutes, p_dly.confidence))
    st["widths"].append((layer, cp_no, cp.sll_width_mm))
    st["temps"].append((layer, cp_no, cp.temperature))
    for k in ("ext", "dly", "widths", "temps"):
        st[k] = st[k][-40:]
    if runner.publish:
        sid = str(runner.session_id)
        for p in (p_ext, p_dly):
            await hub.publish(f"session:{sid}", "prediction", {
                "id": str(p.id), "target": p.target.value, "layer": layer, "checkpoint": cp_no,
                "value": p.predicted_value, "unit": p.unit, "lower": p.lower, "upper": p.upper,
                "confidence": p.confidence, "class_probabilities": p.class_probabilities,
                "observed": p.observed_value, "top_factors": p.top_factors}, session_id=sid)
    await runner.rec_engine.evaluate(db, cp, p_ext, p_dly)


def setup(runner) -> None:
    runner.ml_state = {"ext": [], "dly": [], "widths": [], "temps": [], "rejected": {}}
    runner.rec_engine = RecommendationEngine(runner, get_registry())
    runner.checkpoint_hooks.append(on_checkpoint)


def register() -> None:
    if setup not in RUNNER_SETUP_HOOKS:
        RUNNER_SETUP_HOOKS.append(setup)
