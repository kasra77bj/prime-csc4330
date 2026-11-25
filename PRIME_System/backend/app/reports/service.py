"""Quality score, session reports and data export (docs/17 sections 5-7, task T3.5).

Everything here is deterministic and offline: the summary is a template filled from the KPIs (no LLM).
"""
from __future__ import annotations

import csv
import io
import logging
import statistics
import uuid
import zipfile
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (Adjustment, Alert, Layer, Prediction, Printer, PrintJob, PrintSession, Reading,
                        Recommendation, RecStatus, SessionReport, SessionStatus, User)

log = logging.getLogger("prime.reports")
EXT_AGREE_RPM = 4.0          # same threshold the recommender uses (docs/20 section 5)
DECIDED = {RecStatus.accepted, RecStatus.modified, RecStatus.rejected, RecStatus.superseded}
PARAM_TEXT = {"pump_rpm": ("pump speed", "RPM"), "interlayer_delay": ("interlayer delay", "min"),
              "print_speed": ("print speed", "mm/s")}
# (column, header with unit, label) for readings: the export and the parameters table share it
READING_COLS = [
    ("temperature", "temperature_C", "Material temperature"), ("pump_rpm", "pump_rpm_RPM", "Pump speed"),
    ("voltage", "voltage_V", "Pump voltage"), ("current", "current_A", "Pump current"),
    ("duty", "duty_pct", "Pump duty"), ("motor_power", "motor_power_W", "Motor power"),
    ("print_speed", "print_speed_mm_s", "Print speed"), ("sll_width", "sll_width_mm", "Layer width"),
    ("sll_height", "sll_height_mm", "Layer height"), ("total_height", "total_height_mm", "Wall height"),
    ("flow", "flow_mm3_s", "Flow"), ("delay_setting_min", "delay_setting_min", "Interlayer delay"),
]
UNITS = {"temperature": "°C", "pump_rpm": "RPM", "voltage": "V", "current": "A", "duty": "%", "motor_power": "W",
         "print_speed": "mm/s", "sll_width": "mm", "sll_height": "mm", "total_height": "mm", "flow": "mm³/s",
         "delay_setting_min": "min"}
TABLE_SIGNALS = ("temperature", "pump_rpm", "motor_power", "print_speed", "sll_width", "sll_height", "flow",
                 "delay_setting_min")


# ---------------------------------------------------------------- quality score (docs/17 section 5)
def quality_score(layer_flags: list[bool], ack_seconds: list[float], decided: int, expired: int) -> dict:
    """score = 100 x (0.6 x in-tolerance layers + 0.25 x alert response + 0.15 x decisions made)."""
    lw = sum(layer_flags) / len(layer_flags) if layer_flags else 1.0
    med = statistics.median(ack_seconds) if ack_seconds else None
    arf = 1.0 if med is None else max(0.0, min(1.0, 1 - (med - 15) / 120))
    df = decided / (decided + expired) if decided + expired else 1.0
    return {"score": round(100 * (0.6 * lw + 0.25 * arf + 0.15 * df), 1), "layers_within_ratio": round(lw, 3),
            "alert_response_factor": round(arf, 3), "decision_factor": round(df, 3),
            "median_ack_s": round(med, 1) if med is not None else None}


def trailing_streak(flags: list[bool]) -> int:
    n = 0
    for f in reversed(flags):
        if not f:
            break
        n += 1
    return n


async def quality(db: AsyncSession, session_id: uuid.UUID) -> dict:
    flags = list((await db.scalars(select(Layer.within_tolerance).where(
        Layer.session_id == session_id, Layer.within_tolerance.is_not(None)).order_by(Layer.layer_no))).all())
    acks = (await db.execute(select(Alert.raised_at, Alert.acknowledged_at).where(
        Alert.session_id == session_id, Alert.acknowledged_at.is_not(None)))).all()
    statuses = (await db.scalars(select(Recommendation.status).where(
        Recommendation.session_id == session_id))).all()
    q = quality_score(flags, [(b - a).total_seconds() for a, b in acks],
                      sum(s in DECIDED for s in statuses), sum(s == RecStatus.expired for s in statuses))
    return {**q, "streak": trailing_streak(flags), "layers_scored": len(flags),
            "layers_within": sum(flags)}


async def update_quality(db: AsyncSession, session_id: uuid.UUID) -> float:
    q = await quality(db, session_id)
    await db.execute(update(PrintSession).where(PrintSession.id == session_id).values(quality_score=q["score"]))
    return q["score"]


# ---------------------------------------------------------------- report (docs/17 section 6)
def _dur(seconds: float) -> str:
    m = round(seconds / 60)
    return f"{m // 60} h {m % 60:02d} m" if m >= 60 else f"{m} min"


def _count(n: int, word: str) -> str:
    """'1 alert was' / '2 alerts were'."""
    return f"{n} {word}{'' if n == 1 else 's'} {'was' if n == 1 else 'were'}"


def _num(v: float) -> str:
    return f"{v:g}"


def summary_text(name: str, printer: str, status: SessionStatus, k: dict, adjustments: list[dict]) -> str:
    verb = {SessionStatus.completed: "finished", SessionStatus.stopped: "was stopped",
            SessionStatus.aborted: "was aborted"}.get(status, "is in progress")
    parts = [f"{name} on {printer} {verb} after {k['layers_done']} of {k['layers_total']} layers "
             f"({_dur(k['duration_s'])} of print time)."]
    a = k["alerts"]
    if a["total"] == 0:
        parts.append("No alerts were raised.")
    else:
        ack = f"; median acknowledgement time {k['median_ack_s']:g} s" if k["median_ack_s"] is not None else ""
        parts.append(f"{_count(a['total'], 'alert')} raised ({a['critical']} critical, "
                     f"{a['warning']} warning, {a['info']} info){ack}.")
    ai = [x for x in adjustments if x["source"] != "manual"]
    for x in ai[:3]:
        name_, unit = PARAM_TEXT[x["parameter"]]
        how = "accepted" if x["source"] == "ai_accepted" else "modified and applied"
        when = f"from layer {x['applied_at_layer']}" if x["applied_at_layer"] else "(not applied before the end)"
        parts.append(f"{x['user_name'] or 'An engineer'} {how} the AI suggestion to change {name_} "
                     f"{_num(x['from_value'])} → {_num(x['to_value'])} {unit} {when}.")
    manual = [x for x in adjustments if x["source"] == "manual"]
    if manual:
        parts.append(f"Manual changes logged as independent engineer decisions: {len(manual)}.")
    if k["recommendations"]["rejected"]:
        parts.append(f"{_count(k['recommendations']['rejected'], 'AI suggestion')} rejected with a reason.")
    w = k["width"]
    if w["avg"] is not None:
        parts.append(f"Layer width averaged {w['avg']:.1f} mm (target {w['target']:g} ± {w['tolerance']:g} mm); "
                     f"{k['layers_within']} of {k['layers_done']} layers stayed within tolerance.")
    acc = k["accuracy"]
    if acc["extrusion_rate"]["n"]:
        parts.append(f"Model agreement: extrusion {acc['extrusion_rate']['pct']:g} % of checkpoints within "
                     f"±{EXT_AGREE_RPM:g} RPM of the applied pump speed; interlayer delay "
                     f"{acc['interlayer_delay']['pct']:g} % matched the delay setting.")
    parts.append(f"Quality score {round(k['quality_score'])} / 100.")
    return " ".join(parts)


def _pct(n: int, d: int) -> float:
    return round(100 * n / d, 1) if d else 0.0


async def _adjustments(db: AsyncSession, session_id: uuid.UUID) -> list[dict]:
    from app.api.v1.ai import adj_dict
    rows = (await db.execute(select(Adjustment, User.full_name).join(User, User.id == Adjustment.user_id)
                             .where(Adjustment.session_id == session_id).order_by(Adjustment.created_at))).all()
    return [adj_dict(a, n) for a, n in rows]


async def build_report(db: AsyncSession, session_id: uuid.UUID) -> SessionReport:
    """(Re)generates the stored report: KPIs, parameters table and the summary paragraph."""
    s = await db.get(PrintSession, session_id)
    job, printer = await db.get(PrintJob, s.job_id), await db.get(Printer, s.printer_id)
    layers = (await db.scalars(select(Layer).where(Layer.session_id == session_id)
                               .order_by(Layer.layer_no))).all()
    alerts = (await db.scalars(select(Alert).where(Alert.session_id == session_id))).all()
    recs = (await db.scalars(select(Recommendation).where(Recommendation.session_id == session_id))).all()
    preds = (await db.scalars(select(Prediction).where(Prediction.session_id == session_id))).all()
    adjs = await _adjustments(db, session_id)
    q = await quality(db, session_id)
    s.quality_score = q["score"]
    ext = [p for p in preds if p.target.value == "extrusion_rate" and p.observed_value is not None]
    dly = [p for p in preds if p.target.value == "interlayer_delay" and p.observed_value is not None]
    widths = [x.measured_width_mm for x in layers if x.measured_width_mm is not None]
    done = [x for x in layers if x.ended_at is not None]
    sev = {v: sum(1 for a in alerts if a.severity.value == v) for v in ("info", "warning", "critical")}
    kpis = {
        "duration_s": round(s.sim_time_s), "started_at": s.started_at, "ended_at": s.ended_at,
        "status": s.status.value, "layers_done": len(done), "layers_total": job.total_layers,
        "layers_within": q["layers_within"],
        "alerts": {**sev, "total": len(alerts)}, "median_ack_s": q["median_ack_s"],
        "adjustments": {src: sum(1 for a in adjs if a["source"] == src)
                        for src in ("ai_accepted", "ai_modified", "manual")} | {"total": len(adjs)},
        "recommendations": {st.value: sum(1 for r in recs if r.status == st) for st in RecStatus},
        "accuracy": {
            "extrusion_rate": {
                "n": len(ext), "pct": _pct(sum(abs(p.predicted_value - p.observed_value) <= EXT_AGREE_RPM
                                               for p in ext), len(ext)),
                "mae_rpm": round(statistics.fmean(abs(p.predicted_value - p.observed_value) for p in ext), 2)
                if ext else None},
            "interlayer_delay": {"n": len(dly), "pct": _pct(sum(p.predicted_value == p.observed_value
                                                                for p in dly), len(dly))}},
        "quality_score": q["score"], "quality": q,
        "width": {"avg": round(statistics.fmean(widths), 2) if widths else None,
                  "min": round(min(widths), 2) if widths else None, "max": round(max(widths), 2) if widths else None,
                  "target": job.target_layer_width_mm, "tolerance": job.width_tolerance_mm},
    }
    rows = (await db.execute(select(*[getattr(Reading, c) for c in TABLE_SIGNALS], Reading.phase)
                             .where(Reading.session_id == session_id).order_by(Reading.seq))).all()
    table = []
    for i, c in enumerate(TABLE_SIGNALS):
        vals = [r[i] for r in rows if r[i] is not None and (c == "delay_setting_min" or r[-1] == "printing")]
        if vals:
            table.append({"signal": c, "label": next(lab for col, _, lab in READING_COLS if col == c),
                          "unit": UNITS[c], "start": round(vals[0], 3), "end": round(vals[-1], 3),
                          "min": round(min(vals), 3), "max": round(max(vals), 3),
                          "avg": round(statistics.fmean(vals), 3)})
    text = summary_text(job.name, printer.name, s.status, kpis, adjs)
    kpis = _iso(kpis)
    rep = await db.scalar(select(SessionReport).where(SessionReport.session_id == session_id))
    if rep is None:
        rep = SessionReport(session_id=session_id, generated_at=datetime.now(timezone.utc), kpis=kpis,
                            summary_text=text, parameters_table=table)
        db.add(rep)
    else:
        rep.generated_at, rep.kpis, rep.summary_text, rep.parameters_table = \
            datetime.now(timezone.utc), kpis, text, table
    await db.flush()
    return rep


def _iso(v):
    if isinstance(v, dict):
        return {k: _iso(x) for k, x in v.items()}
    return v.isoformat() if isinstance(v, datetime) else v


async def charts(db: AsyncSession, session_id: uuid.UUID) -> dict:
    """Chart data for the report page, computed on read (cheap): per-layer measured vs model, alert timeline."""
    layers = (await db.scalars(select(Layer).where(Layer.session_id == session_id)
                               .order_by(Layer.layer_no))).all()
    preds = (await db.scalars(select(Prediction).where(Prediction.session_id == session_id))).all()
    alerts = (await db.scalars(select(Alert).where(Alert.session_id == session_id)
                               .order_by(Alert.raised_at))).all()
    per: dict[int, dict] = {}
    for p in preds:
        d = per.setdefault(p.layer_no, {"ext": [], "dly": []})
        d["ext" if p.target.value == "extrusion_rate" else "dly"].append(p.predicted_value)
    out = []
    for x in layers:
        d = per.get(x.layer_no, {"ext": [], "dly": []})
        out.append({"layer": x.layer_no, "width_mm": x.measured_width_mm, "within": x.within_tolerance,
                    "avg_rpm": x.avg_rpm, "model_rpm": round(statistics.fmean(d["ext"]), 1) if d["ext"] else None,
                    "delay_min": x.interlayer_delay_min,
                    "model_delay_min": statistics.mode(d["dly"]) if d["dly"] else None,
                    "temperature": x.avg_temperature})
    return {"layers": out, "alerts": [{"id": str(a.id), "layer": a.layer_no, "severity": a.severity.value,
                                       "signal": a.signal.value, "message": a.message,
                                       "raised_at": a.raised_at.isoformat(), "status": a.status.value}
                                      for a in alerts]}


async def report_payload(db: AsyncSession, session_id: uuid.UUID) -> dict:
    rep = await db.scalar(select(SessionReport).where(SessionReport.session_id == session_id))
    if rep is None:
        rep = await build_report(db, session_id)
        await db.commit()
    return {"session_id": str(session_id), "generated_at": rep.generated_at.isoformat(), "kpis": rep.kpis,
            "summary_text": rep.summary_text, "parameters_table": rep.parameters_table,
            "charts": await charts(db, session_id), "adjustments": await _adjustments(db, session_id)}


# ---------------------------------------------------------------- end of a print
async def on_session_end(session_id: uuid.UUID, notify_users: bool = True) -> None:
    """Called once a print completes/stops: final quality score, report, 'Report ready', badges, shift goal."""
    from app.core.notify import notify
    from app.db import SessionLocal
    from app.gamification.service import on_session_end as gamify
    try:
        async with SessionLocal() as db:
            rep = await build_report(db, session_id)
            s = await db.get(PrintSession, session_id)
            job = await db.get(PrintJob, s.job_id)
            await gamify(db, s, rep.kpis["quality_score"])
            if notify_users:
                k = rep.kpis
                body = (f"Quality {k['quality_score']:g} · {k['alerts']['critical']} critical alerts · "
                        f"{k['layers_done']}/{k['layers_total']} layers")
                for uid in {s.operator_id, s.engineer_id} - {None}:
                    await notify(db, uid, "report_ready", f"{job.name} report ready", body,
                                 f"/sessions/{session_id}/report")
            await db.commit()
    except Exception:          # a report problem must never break the replay loop
        log.exception("report generation failed for %s", session_id)


# ---------------------------------------------------------------- export (docs/17 section 7)
def _csv(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


async def export_bundle(db: AsyncSession, session_id: uuid.UUID) -> dict:
    """Everything about one session as plain JSON-able dicts (used by both export formats)."""
    from app.alerts.engine import alert_dict
    from app.ml.recommend import rec_dict
    s = await db.get(PrintSession, session_id)
    job, printer = await db.get(PrintJob, s.job_id), await db.get(Printer, s.printer_id)
    readings = (await db.execute(select(Reading.ts, Reading.sim_t_s, Reading.layer, Reading.checkpoint,
                                        Reading.phase, Reading.source, *[getattr(Reading, c) for c, _, _ in
                                                                         READING_COLS])
                                 .where(Reading.session_id == session_id).order_by(Reading.seq))).all()
    preds = (await db.scalars(select(Prediction).where(Prediction.session_id == session_id)
                              .order_by(Prediction.layer_no, Prediction.checkpoint_no, Prediction.target))).all()
    layers = (await db.scalars(select(Layer).where(Layer.session_id == session_id)
                               .order_by(Layer.layer_no))).all()
    recs = (await db.scalars(select(Recommendation).where(Recommendation.session_id == session_id)
                             .order_by(Recommendation.created_at))).all()
    alerts = (await db.scalars(select(Alert).where(Alert.session_id == session_id)
                               .order_by(Alert.raised_at))).all()
    rep = await report_payload(db, session_id)
    return {
        "session": {"id": str(s.id), "status": s.status.value, "started_at": _iso(s.started_at),
                    "ended_at": _iso(s.ended_at), "print_time_s": s.sim_time_s, "quality_score": s.quality_score,
                    "scenario_name": s.scenario_name},
        "job": {"name": job.name, "code": job.code, "total_layers": job.total_layers, "mixture": job.mixture,
                "target_layer_width_mm": job.target_layer_width_mm, "width_tolerance_mm": job.width_tolerance_mm,
                "target_layer_height_mm": job.target_layer_height_mm},
        "printer": {"name": printer.name, "bay": printer.bay, "nozzle": printer.nozzle},
        "readings": [{"ts_utc": _iso(r[0]), "sim_t_s": r[1], "layer": r[2], "checkpoint": r[3], "phase": r[4],
                      "source": r[5].value, **{h: r[6 + i] for i, (_, h, _) in enumerate(READING_COLS)}}
                     for r in readings],
        "layers": [{"layer": x.layer_no, "started_at": _iso(x.started_at), "ended_at": _iso(x.ended_at),
                    "measured_width_mm": x.measured_width_mm, "measured_height_mm": x.measured_height_mm,
                    "total_height_mm": x.total_height_mm, "interlayer_delay_min": x.interlayer_delay_min,
                    "avg_rpm": x.avg_rpm, "avg_temperature_C": x.avg_temperature,
                    "within_tolerance": x.within_tolerance} for x in layers],
        "predictions": [{"layer": p.layer_no, "checkpoint": p.checkpoint_no, "target": p.target.value,
                         "predicted_value": p.predicted_value, "unit": p.unit, "lower": p.lower, "upper": p.upper,
                         "confidence": p.confidence, "observed_value": p.observed_value,
                         "source": p.source.value, "features": p.features} for p in preds],
        "recommendations": [rec_dict(r) for r in recs],
        "adjustments": rep["adjustments"],
        "alerts": [alert_dict(a) for a in alerts],
        "report": {k: rep[k] for k in ("generated_at", "kpis", "summary_text", "parameters_table")},
    }


def bundle_to_zip(b: dict) -> bytes:
    """CSV export: readings, predictions, adjustments, alerts (canonical names, units in the headers)."""
    files = {
        "readings.csv": (["ts_utc", "sim_t_s", "layer", "checkpoint", "phase", "source",
                          *[h for _, h, _ in READING_COLS]], [list(r.values()) for r in b["readings"]]),
        "predictions.csv": (["layer", "checkpoint", "target", "predicted_value", "unit", "lower", "upper",
                             "confidence", "observed_value", "source"],
                            [[p[k] for k in ("layer", "checkpoint", "target", "predicted_value", "unit", "lower",
                                             "upper", "confidence", "observed_value", "source")]
                             for p in b["predictions"]]),
        "adjustments.csv": (["created_at_utc", "parameter", "from_value", "to_value", "source", "user",
                             "note", "requested_at_layer", "applied_at_layer"],
                            [[a["created_at"], a["parameter"], a["from_value"], a["to_value"], a["source"],
                              a["user_name"], a["note"], a["requested_at_layer"], a["applied_at_layer"]]
                             for a in b["adjustments"]]),
        "alerts.csv": (["raised_at_utc", "layer", "signal", "kind", "severity", "status", "value", "threshold",
                        "message", "acknowledged_at_utc", "resolved_at_utc"],
                       [[a["raised_at"], a["layer_no"], a["signal"], a["kind"], a["severity"], a["status"],
                         a["value"], a["threshold"], a["message"], a["acknowledged_at"], a["resolved_at"]]
                        for a in b["alerts"]]),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, (header, rows) in files.items():
            z.writestr(name, _csv(header, rows))
    return buf.getvalue()
