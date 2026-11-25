"""Phase 2: models in the replay loop, suggestions, decisions (US-09/10/11)."""
import uuid

import pandas as pd
import pytest
from sqlalchemy import select, update

from app.db import SessionLocal
from app.ml.registry import get_registry
from app.ml.service import register
from app.models import Layer, PrintSession, Recommendation, RecStatus, SessionStatus
from app.replay.manager import manager
from app.replay.runner import SessionRunner
from tests.test_replay import _clone_demo_session


@pytest.fixture(autouse=True)
def _ml():
    register()


def test_registry_reproduces_generator_outputs():
    from pathlib import Path
    reg = get_registry()
    cp = pd.read_csv(Path(__file__).resolve().parents[2] / "data/generated/demo_wp03_checkpoints.csv")
    for _, r in cp.iterrows():
        ext, dly = reg.predict(r.flow, r.motor_power_w, r.temperature_c, explain=False)
        assert abs(ext.rpm - r.xgb_pred_rpm) < 0.02 and dly.minutes == r.rf_pred_delay_min


async def _live_runner(sid):
    """A runner registered with the manager (as if started), driven manually with run_fast."""
    async with SessionLocal() as db:
        await db.execute(update(PrintSession).where(PrintSession.id == sid).values(status=SessionStatus.running))
        await db.commit()
    r = SessionRunner(sid, publish=True)
    await r.load()
    from app.replay.manager import RUNNER_SETUP_HOOKS
    for h in RUNNER_SETUP_HOOKS:
        h(r)
    manager.runners[sid] = r
    return r


async def _recs(sid):
    async with SessionLocal() as db:
        return (await db.scalars(select(Recommendation).where(Recommendation.session_id == sid)
                                 .order_by(Recommendation.created_at))).all()


async def test_demo_story_accept_then_delay(client, auth):
    eng = await auth("engineer")
    sid = await _clone_demo_session()
    r = await _live_runner(sid)
    await r.run_fast(max_layer=4)
    assert await _recs(sid) == [], "no suggestions while the operator's RPM matches the model"
    await r.run_fast(max_layer=5)
    recs = await _recs(sid)
    assert len(recs) == 1 and recs[0].status == RecStatus.pending
    rec = recs[0]
    assert rec.parameter.value == "pump_rpm" and rec.current_value == 27 and rec.proposed_value == 34
    assert rec.created_at_layer == 5 and 0.5 <= rec.confidence <= 0.97
    assert "Layer width fell" in rec.reason_lines[0] and rec.reason_lines[1].startswith("Biggest factor")
    assert rec.predicted_effect["with_change"][-1] == pytest.approx(19.5, abs=0.01)
    op = await auth("operator")
    assert (await client.post(f"/api/v1/recommendations/{rec.id}/accept", headers=op)).status_code == 403
    res = await client.post(f"/api/v1/recommendations/{rec.id}/accept", headers=eng)
    assert res.status_code == 200, res.text
    assert res.json()["recommendation"]["status"] == "accepted" and res.json()["adjustment"]["to_value"] == 34
    again = await client.post(f"/api/v1/recommendations/{rec.id}/accept", headers=eng)
    assert again.status_code == 409
    await r.run_fast(max_layer=6)
    assert not r.branch_active
    async with SessionLocal() as db:
        l6 = await db.scalar(select(Layer).where(Layer.session_id == sid, Layer.layer_no == 6))
    assert round(l6.avg_rpm) == 34 and l6.within_tolerance is not None
    await r.run_fast(stop_at=(7, 4))      # the delay suggestion appears after checkpoint 2 of layer 7
    recs = await _recs(sid)
    assert [(x.parameter.value, x.status.value) for x in recs] == [("pump_rpm", "accepted"),
                                                                   ("interlayer_delay", "pending")]
    d = recs[1]
    assert (d.current_value, d.proposed_value) == (5, 10) and "19.8" in " ".join(d.reason_lines)
    res = await client.post(f"/api/v1/recommendations/{d.id}/accept", headers=eng)
    assert res.status_code == 200
    await r.run_fast()
    async with SessionLocal() as db:
        l7 = await db.scalar(select(Layer).where(Layer.session_id == sid, Layer.layer_no == 7))
    assert l7.interlayer_delay_min == 10
    preds = (await client.get(f"/api/v1/sessions/{sid}/predictions?target=extrusion_rate", headers=op)).json()
    assert len(preds) == 32 and preds[0]["top_factors"][0]["feature"] in ("Flow", "Motor Power", "Temperature (C)")
    notes = (await client.get("/api/v1/me/notifications", headers=op)).json()
    assert any(n["title"].startswith("Change applied at layer 6") for n in notes)
    assert any(n["title"] == "Heads-up from the AI" for n in notes)
    manager.runners.pop(sid, None)


async def test_reject_then_no_action_branch_and_new_suggestion(client, auth):
    eng = await auth("engineer")
    sid = await _clone_demo_session()
    r = await _live_runner(sid)
    await r.run_fast(max_layer=5)
    rec = (await _recs(sid))[0]
    bad = await client.post(f"/api/v1/recommendations/{rec.id}/reject", headers=eng, json={})
    assert bad.status_code == 422
    res = await client.post(f"/api/v1/recommendations/{rec.id}/reject", headers=eng,
                            json={"reason": "disagree_model", "note": "testing"})
    assert res.json()["recommendation"]["status"] == "rejected"
    await r.run_fast(max_layer=6)
    assert r.branch_active
    recs = await _recs(sid)
    assert recs[-1].status == RecStatus.pending and recs[-1].created_at_layer == 6 and recs[-1].current_value == 27
    manager.runners.pop(sid, None)


async def test_modify_and_manual_adjustment(client, auth):
    eng, op = await auth("engineer"), await auth("operator")
    sid = await _clone_demo_session()
    r = await _live_runner(sid)
    await r.run_fast(max_layer=5)
    rec = (await _recs(sid))[0]
    too_big = await client.post(f"/api/v1/recommendations/{rec.id}/modify", headers=eng, json={"final_value": 60})
    assert too_big.status_code == 422
    res = await client.post(f"/api/v1/recommendations/{rec.id}/modify", headers=eng,
                            json={"final_value": 32, "note": "a bit gentler"})
    assert res.json()["adjustment"]["source"] == "ai_modified" and res.json()["adjustment"]["to_value"] == 32
    body = {"parameter": "print_speed", "to_value": 11, "note": "slightly faster"}
    assert (await client.post(f"/api/v1/sessions/{sid}/adjustments", headers=op, json=body)).status_code == 403
    assert (await client.post(f"/api/v1/sessions/{sid}/adjustments", headers=eng,
                              json={**body, "note": ""})).status_code == 422
    res = await client.post(f"/api/v1/sessions/{sid}/adjustments", headers=eng, json=body)
    assert res.status_code == 201 and res.json()["source"] == "manual"
    log = (await client.get(f"/api/v1/sessions/{sid}/adjustments", headers=op)).json()
    assert [a["source"] for a in log] == ["ai_modified", "manual"] and log[1]["user_name"] == "Demo Engineer"
    await r.run_fast(max_layer=6)
    log = (await client.get(f"/api/v1/sessions/{sid}/adjustments", headers=op)).json()
    assert all(a["applied_at_layer"] == 6 for a in log)
    models = await client.get("/api/v1/models", headers=op)
    assert models.status_code == 403
    models = (await client.get("/api/v1/models", headers=eng)).json()
    assert {m["algorithm"] for m in models["models"]} == {"xgboost", "random_forest"}
    manager.runners.pop(sid, None)


async def test_history_has_accepted_suggestion(client, auth):
    op = await auth("operator")
    hist = (await client.get("/api/v1/sessions?status=completed", headers=op)).json()[0]
    recs = (await client.get(f"/api/v1/sessions/{hist['id']}/recommendations", headers=op)).json()
    assert len(recs) == 1 and recs[0]["status"] == "accepted" and recs[0]["title"] == "Increase pump speed 18 → 24 RPM"
    _ = uuid


async def test_critical_alert_auto_pauses_until_ai_decision(client, auth):
    """Edit 6: a critical alert pauses the live print; accepting the AI suggestion resumes it and the
    print returns to the main (corrected) track at the next layer. Motor power is shown as a positive value."""
    from app.models import ControlEvent
    eng = await auth("engineer")
    sid = await _clone_demo_session()
    r = await _live_runner(sid)
    await r.run_fast(max_layer=5)
    rec = (await _recs(sid))[0]
    await client.post(f"/api/v1/recommendations/{rec.id}/reject", headers=eng,
                      json={"reason": "disagree_model", "note": "show the critical path"})
    await r.run_fast(max_layer=6)
    assert r.branch_active and r.status == SessionStatus.paused and r.auto_paused
    detail = (await client.get(f"/api/v1/sessions/{sid}", headers=eng)).json()
    assert detail["status"] == "paused" and detail["auto_paused"] is True
    assert detail["pause_reason"].startswith("Paused automatically")
    async with SessionLocal() as db:
        ev = (await db.scalars(select(ControlEvent).where(ControlEvent.session_id == sid))).all()
    assert ev and ev[-1].user_id is None
    pending = [x for x in await _recs(sid) if x.status == RecStatus.pending]
    assert pending, "an AI suggestion is waiting for the engineer"
    res = await client.post(f"/api/v1/recommendations/{pending[-1].id}/accept", headers=eng)
    assert res.status_code == 200, res.text
    assert r.status == SessionStatus.running and not r.auto_paused
    await r.run_fast(max_layer=7)
    assert r.recovered and not r.branch_active
    readings = (await client.get(f"/api/v1/sessions/{sid}/readings?signals=motor_power&last_s=600",
                                 headers=eng)).json()["points"]
    assert readings and all((p["motor_power"] or 0) >= 0 for p in readings)
    manager.runners.pop(sid, None)
