"""Recommendation engine + decisions (docs/15 section 6, docs/20 section 5; tasks T2.2/T2.3).

Rules
- Pump RPM: the last two checkpoint predictions of the current layer both differ from the running RPM by
  >= min_delta in the same direction -> propose round(latest prediction), capped at +/- max_step and pump limits.
  While a suggestion is pending it is updated in place as new checkpoints arrive.
- Interlayer delay: the last two checkpoint classes agree on a value different from the current setting
  (probability >= min_confidence) -> propose that delay; it applies right after the current layer.
- A rejected parameter is not proposed again in the same layer. Pending suggestions expire after the next layer.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import APIError
from app.core.notify import notify
from app.models import (AdjustParam, Adjustment, AdjustSource, Escalation, Prediction, Recommendation, RecStatus,
                        RejectReason, User)
from app.ws.hub import hub

FEATURE_TEXT = {
    "Motor Power": lambda v: f"pump motor power ({abs(v):.2f} W)",
    "Flow": lambda v: f"flow demand ({v:,.0f} mm³/s)",
    "Temperature (C)": lambda v: f"material temperature ({v:.1f} °C)",
}
PARAM_LABEL = {"pump_rpm": ("pump speed", "RPM"), "interlayer_delay": ("interlayer delay", "min"),
               "print_speed": ("print speed", "mm/s")}


def rec_title(param: str, current: float, proposed: float) -> str:
    name, unit = PARAM_LABEL[param]
    verb = "Increase" if proposed > current else "Decrease"
    return f"{verb} {name} {current:g} → {proposed:g} {unit}"


def rec_dict(r: Recommendation) -> dict:
    return {"id": str(r.id), "session_id": str(r.session_id), "prediction_id": str(r.prediction_id),
            "parameter": r.parameter.value, "current_value": r.current_value, "proposed_value": r.proposed_value,
            "title": rec_title(r.parameter.value, r.current_value, r.proposed_value),
            "reason_lines": r.reason_lines, "predicted_effect": r.predicted_effect, "risk_text": r.risk_text,
            "confidence": r.confidence, "status": r.status.value, "created_at_layer": r.created_at_layer,
            "expires_at_layer": r.expires_at_layer, "decided_by": str(r.decided_by) if r.decided_by else None,
            "decided_at": r.decided_at.isoformat() if r.decided_at else None, "final_value": r.final_value,
            "reject_reason": r.reject_reason.value if r.reject_reason else None, "reject_note": r.reject_note,
            "created_at": r.created_at.isoformat() if r.created_at else None}


def factor_line(top: list[dict], unit: str, toward: str | None = None, direction: int = 0) -> str | None:
    """Explains the single biggest SHAP factor; with `direction` (+1/-1) it picks the biggest factor pushing
    the estimate that way, so the sentence supports the suggestion instead of contradicting it."""
    if not top:
        return None
    cands = [t for t in top if direction == 0 or t["contribution"] * direction > 0] or top
    f = max(cands, key=lambda t: abs(t["contribution"]))
    text = FEATURE_TEXT.get(f["feature"], lambda v: f["feature"])(f["value"])
    if toward:
        return f"Biggest factor: {text}, which points the model toward {toward}."
    word = "raised" if f["contribution"] > 0 else "lowered"
    return f"Biggest factor: {text} {word} the model's estimate by {abs(f['contribution']):.1f} {unit}."


async def publish_rec(r: Recommendation, site_id) -> None:
    data = rec_dict(r)
    await hub.publish(f"session:{r.session_id}", "recommendation", data, session_id=str(r.session_id))
    await hub.publish(f"site:{site_id}", "recommendation", data, session_id=str(r.session_id))


async def decide(db: AsyncSession, rec: Recommendation, user: User, action: str, runner=None,
                 final_value: float | None = None, reason: RejectReason | None = None, note: str | None = None,
                 request=None, limits: tuple[float, float] | None = None) -> Adjustment | None:
    """accept | modify | reject. Creates the adjustment row and queues it on the running replay."""
    if rec.status != RecStatus.pending:
        raise APIError(409, "NOT_PENDING", f"This suggestion is already {rec.status.value}.")
    now = datetime.now(timezone.utc)
    rec.decided_by, rec.decided_at = user.id, now
    adj = None
    layer = runner.layer if runner is not None else rec.created_at_layer
    if action == "reject":
        if reason is None:
            raise APIError(422, "REASON_REQUIRED", "Pick a reason for rejecting the suggestion.")
        rec.status, rec.reject_reason, rec.reject_note = RecStatus.rejected, reason, note
        if runner is not None:
            runner.ml_state["rejected"][rec.parameter.value] = layer
    else:
        value = rec.proposed_value if action == "accept" else final_value
        if value is None:
            raise APIError(422, "VALUE_REQUIRED", "Enter the value to apply.")
        if limits and not (limits[0] <= value <= limits[1]):
            raise APIError(422, "OUT_OF_LIMITS", f"Value must be between {limits[0]:g} and {limits[1]:g}.")
        if rec.parameter == AdjustParam.pump_rpm and abs(value - rec.current_value) > 20:
            raise APIError(422, "STEP_TOO_LARGE", "Change pump speed by at most 20 RPM at once.")
        if rec.parameter == AdjustParam.interlayer_delay and value not in (1, 5, 10):
            raise APIError(422, "BAD_DELAY", "Interlayer delay must be 1, 5 or 10 minutes.")
        rec.status = RecStatus.accepted if action == "accept" else RecStatus.modified
        rec.final_value = value
        adj = Adjustment(session_id=rec.session_id, parameter=rec.parameter, from_value=rec.current_value,
                         to_value=value, source=AdjustSource.ai_accepted if action == "accept"
                         else AdjustSource.ai_modified, recommendation_id=rec.id, user_id=user.id, note=note,
                         requested_at_layer=layer)
        db.add(adj)
        await db.flush()
        if runner is not None:
            runner.queue_adjustment(rec.parameter.value, value, adj.id, layer)
    # the engineer responded to any open escalation on this session
    for esc in (await db.scalars(select(Escalation).where(Escalation.session_id == rec.session_id,
                                                          Escalation.responded_at.is_(None)))).all():
        esc.responded_at = now
    audit(db, user.id, f"recommendation.{action}", "recommendation", rec.id,
          {"proposed": rec.proposed_value}, {"final": rec.final_value, "reason": reason, "note": note}, request)
    return adj


class RecommendationEngine:
    """Per-runner state + rules. Called after each checkpoint's predictions are stored."""

    def __init__(self, runner, registry):
        self.r = runner
        self.cfg_x = registry.config["extrusion_rate"]["recommend"]
        self.cfg_d = registry.config["interlayer_delay"]["recommend"]

    async def evaluate(self, db: AsyncSession, cp, ext: Prediction, dly: Prediction) -> None:
        st = self.r.ml_state
        layer = self.r.layer
        await self._expire(db, layer)
        # ---------- pump RPM ----------
        same = [p for p in st["ext"] if p[0] == layer][-2:]
        current = round(cp.pump_rpm)
        if len(same) == 2 and st["rejected"].get("pump_rpm") != layer:
            d = [p[2] - current for p in same]
            md = self.cfg_x["min_delta"]
            if all(x >= md for x in d) or all(x <= -md for x in d):
                lo, hi = self.cfg_x["limits"]["min"], self.cfg_x["limits"]["max"]
                lo, hi = max(lo, self.r.printer.rpm_min), min(hi, self.r.printer.rpm_max)
                step = self.cfg_x["max_step"]
                proposed = float(min(max(round(same[-1][2]), current - step, lo), current + step, hi))
                await self._upsert(db, AdjustParam.pump_rpm, current, proposed, ext,
                                   self._ext_reasons(current, ext), self._ext_effect(current, proposed),
                                   f"Low: within pump limits ({lo:g}–{hi:g} RPM)." if lo <= proposed <= hi
                                   else "Check pump limits.", layer)
        # ---------- interlayer delay ----------
        setting = int(self.r.last_row.get("delay_setting_min") or self.r.job.default_interlayer_delay_min) \
            if self.r.last_row else self.r.job.default_interlayer_delay_min
        sd = [p for p in st["dly"] if p[0] == layer][-2:]
        if len(sd) == 2 and st["rejected"].get("interlayer_delay") != layer:
            c1, c2 = sd[0][2], sd[1][2]
            conf = min(sd[0][3], sd[1][3])
            if c1 == c2 and c1 != setting and conf >= self.cfg_d["min_confidence"]:
                await self._upsert(db, AdjustParam.interlayer_delay, float(setting), float(c1), dly,
                                   self._delay_reasons(dly, c1), {"signal": "interlayer_delay", "unit": "min",
                                                                  "current": setting, "proposed": c1},
                                   f"{'Adds' if c1 > setting else 'Saves'} {abs(c1 - setting)} min per layer "
                                   f"of print time.", layer)

    async def _expire(self, db: AsyncSession, layer: int) -> None:
        for rec in (await db.scalars(select(Recommendation).where(
                Recommendation.session_id == self.r.session_id, Recommendation.status == RecStatus.pending,
                Recommendation.expires_at_layer < layer))).all():
            rec.status = RecStatus.expired
            if self.r.publish:
                await publish_rec(rec, self.r.printer.site_id)

    async def _upsert(self, db, param: AdjustParam, current: float, proposed: float, pred: Prediction,
                      reasons: list[str], effect: dict, risk: str, layer: int) -> None:
        if any(p[0] == param.value for p in self.r.pending):
            return          # a decided change is already queued for the next layer: don't ask again
        pending = await db.scalar(select(Recommendation).where(
            Recommendation.session_id == self.r.session_id, Recommendation.parameter == param,
            Recommendation.status == RecStatus.pending))
        if pending is not None:
            if pending.proposed_value == proposed and pending.current_value == current:
                return
            pending.proposed_value, pending.current_value = proposed, current
            pending.prediction_id, pending.reason_lines = pred.id, reasons
            pending.predicted_effect, pending.risk_text, pending.confidence = effect, risk, pred.confidence
            rec, created = pending, False
        else:
            rec = Recommendation(prediction_id=pred.id, session_id=self.r.session_id, parameter=param,
                                 current_value=current, proposed_value=proposed, reason_lines=reasons,
                                 predicted_effect=effect, risk_text=risk, confidence=pred.confidence,
                                 status=RecStatus.pending, created_at_layer=layer, expires_at_layer=layer + 1)
            db.add(rec)
            created = True
        await db.flush()
        if created and self.r.auto_decide_user is not None:      # history backfill: engineer accepted
            await decide(db, rec, self.r.auto_decide_user, "accept", self.r)
        if not self.r.publish:
            return
        await publish_rec(rec, self.r.printer.site_id)
        if created:
            title = "AI suggestion: " + rec_title(param.value, current, proposed)
            await notify(db, self.r.engineer_id, "recommendation", title, reasons[0] if reasons else None,
                         f"/prints/{self.r.session_id}/ai", {"recommendation_id": str(rec.id)})
            if param == AdjustParam.interlayer_delay:
                await notify(db, self.r.operator_id, "nudge", "Heads-up from the AI",
                             f"The model suggests a {proposed:g}-minute interlayer delay (now {current:g} min). "
                             "Your engineer has been asked to review it.",
                             f"/prints/{self.r.session_id}/live", {"recommendation_id": str(rec.id)})

    # ---------------- text + charts ----------------
    def _widths(self) -> list[float]:
        return [w for (_, _, w) in self.r.ml_state["widths"]][-6:]

    def _ext_reasons(self, current: float, pred: Prediction) -> list[str]:
        w = self._widths()
        tgt, tol = self.r.job.target_layer_width_mm, self.r.job.width_tolerance_mm
        lines = []
        if len(w) >= 3 and abs(w[-1] - w[-3]) >= 0.3:
            verb = "fell" if w[-1] < w[-3] else "rose"
            lines.append(f"Layer width {verb} from {w[-3]:.1f} to {w[-1]:.1f} mm over the last 3 checkpoints "
                         f"while the pump stayed at {current:g} RPM (target {tgt:g} ± {tol:g} mm).")
        elif w:
            lines.append(f"Layer width is {w[-1]:.1f} mm (target {tgt:g} ± {tol:g} mm).")
        fl = factor_line(pred.top_factors or [], "RPM",
                         direction=1 if (pred.predicted_value or 0) > current else -1)
        if fl:
            lines.append(fl)
        return lines

    def _delay_reasons(self, pred: Prediction, minutes: int) -> list[str]:
        temps = self.r.ml_state["temps"]
        t_now = temps[-1][2] if temps else None
        prev = [t for (lay, _, t) in temps if lay < self.r.layer]
        lines = []
        if t_now is not None and prev and abs(t_now - prev[-1]) >= 0.5:
            lines.append(f"Material temperature changed from {prev[-1]:.1f} to {t_now:.1f} °C since the last layer.")
        elif t_now is not None:
            lines.append(f"Material temperature is {t_now:.1f} °C.")
        p = (pred.class_probabilities or {}).get(str(minutes), pred.confidence or 0)
        lines.append(f"At these conditions the model recommends {minutes}-minute delays ({p:.0%} likely) so the "
                     f"lower layers gain enough strength before the next one.")
        fl = factor_line(pred.top_factors or [], "", toward=f"{minutes} min")
        if fl:
            lines.append(fl)
        return lines

    def _ext_effect(self, current: float, proposed: float) -> dict:
        w = self._widths()
        tgt, tol = self.r.job.target_layer_width_mm, self.r.job.width_tolerance_mm
        last = w[-1] if w else tgt
        slope = (w[-1] - w[-2]) if len(w) >= 2 else 0.0
        alpha = self.r.scenario.rpm_alpha
        end = min(tgt, last * (proposed / current) ** alpha) if current else last
        with_change = [round(last + (end - last) * k / 3, 2) for k in (1, 2, 3)]
        without = [round(max(last + slope * k, tgt - 3 * tol), 2) for k in (1, 2, 3)]
        return {"signal": "sll_width", "unit": "mm", "history": [round(x, 2) for x in w[-4:]],
                "with_change": with_change, "without_change": without, "target": tgt, "tolerance": tol}
