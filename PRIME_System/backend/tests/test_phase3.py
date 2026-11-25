"""Phase 3: reports + export (US-12/13), quality score, gamification, audit, alerts center context."""
import io
import json
import zipfile
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (Alert, AlertKind, AlertStatus, AuditLog, Badge, PrintSession, SessionReport,
                        SessionStatus, Severity, Signal, User, UserBadge)
from app.reports.service import on_session_end, quality_score, trailing_streak
from app.replay.runner import SessionRunner
from tests.test_replay import _clone_demo_session

API = "/api/v1"


def test_quality_score_formula():
    # all layers in tolerance, fast acks, every suggestion decided -> 100
    assert quality_score([True] * 8, [10.0], 2, 0)["score"] == 100.0
    # 6/8 layers (0.75), median ack 75 s -> 1 - 60/120 = 0.5, 1 of 2 decided -> 0.5
    q = quality_score([True] * 6 + [False] * 2, [60.0, 75.0, 90.0], 1, 1)
    assert q["score"] == round(100 * (0.6 * 0.75 + 0.25 * 0.5 + 0.15 * 0.5), 1)
    assert quality_score([], [], 0, 0)["score"] == 100.0       # nothing to judge yet
    assert quality_score([True], [500.0], 0, 0)["alert_response_factor"] == 0.0
    assert trailing_streak([True, False, True, True]) == 2 and trailing_streak([]) == 0


async def _history(client, headers):
    sessions = (await client.get(f"{API}/sessions", headers=headers)).json()
    return next(s for s in sessions if s["status"] == "completed")


async def test_history_report_and_roles(client, auth):
    mgr, op, adm = await auth("manager"), await auth("operator"), await auth("admin")
    h = await _history(client, mgr)
    r = await client.get(f"{API}/sessions/{h['id']}/report", headers=mgr)
    assert r.status_code == 200, r.text
    rep = r.json()
    k = rep["kpis"]
    assert k["layers_done"] == 8 and k["layers_total"] == 8 and k["status"] == "completed"
    assert k["adjustments"]["ai_accepted"] >= 1 and k["accuracy"]["extrusion_rate"]["n"] > 0
    assert 0 <= k["quality_score"] <= 100
    assert rep["summary_text"].startswith("Wall Panel WP-02 on Gantry-02 finished after 8 of 8 layers")
    assert {row["signal"] for row in rep["parameters_table"]} >= {"temperature", "pump_rpm", "sll_width"}
    assert len(rep["charts"]["layers"]) == 8
    assert (await client.get(f"{API}/sessions/{h['id']}/report", headers=op)).status_code == 403
    assert (await client.get(f"{API}/sessions/{h['id']}/report", headers=adm)).status_code == 200
    # summary is editable by engineers/managers only
    r = await client.patch(f"{API}/sessions/{h['id']}/report", headers=mgr,
                           json={"summary_text": "Edited by the manager for the weekly review."})
    assert r.status_code == 200 and r.json()["summary_text"].startswith("Edited by the manager")
    assert (await client.patch(f"{API}/sessions/{h['id']}/report", headers=adm,
                               json={"summary_text": "Admins cannot edit reports."})).status_code == 403


async def test_exports_csv_zip_and_json(client, auth):
    eng, op, adm = await auth("engineer"), await auth("operator"), await auth("admin")
    h = await _history(client, eng)
    r = await client.get(f"{API}/sessions/{h['id']}/export.csv", headers=eng)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert "PRIME_A-1019_" in r.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert sorted(z.namelist()) == ["adjustments.csv", "alerts.csv", "predictions.csv", "readings.csv"]
    readings = z.read("readings.csv").decode().splitlines()
    assert readings[0].startswith("ts_utc,sim_t_s,layer,checkpoint,phase,source,temperature_C,pump_rpm_RPM")
    assert len(readings) > 3000
    r = await client.get(f"{API}/sessions/{h['id']}/export.json", headers=eng)
    b = json.loads(r.content)
    assert set(b) == {"session", "job", "printer", "readings", "layers", "predictions", "recommendations",
                      "adjustments", "alerts", "report"}
    assert b["job"]["code"] == "A-1019" and len(b["layers"]) == 8
    for who in (op, adm):
        assert (await client.get(f"{API}/sessions/{h['id']}/export.csv", headers=who)).status_code == 403
    async with SessionLocal() as db:
        n = (await db.scalars(select(AuditLog).where(AuditLog.action == "session.export"))).all()
    assert len(n) == 2


async def test_stopped_print_gets_report_and_quality(seeded):
    sid = await _clone_demo_session()
    r = SessionRunner(sid, publish=False)
    await r.load()
    await r.run_fast(max_layer=3)
    r._close_segment()
    r._close_layer()
    await r.flush()
    async with SessionLocal() as db:
        s = await db.get(PrintSession, sid)
        s.status = SessionStatus.stopped
        assert s.quality_score is not None, "quality is recomputed at every layer end"
        await db.commit()
    await on_session_end(sid, notify_users=False)
    async with SessionLocal() as db:
        rep = await db.scalar(select(SessionReport).where(SessionReport.session_id == sid))
    assert rep.kpis["layers_done"] == 3 and "was stopped after 3 of 8 layers" in rep.summary_text
    assert rep.kpis["quality_score"] == 100.0       # layers 1-3 are calm and in tolerance


async def test_achievements_practice_stop_and_audit(client, auth):
    op, eng, adm = await auth("operator"), await auth("engineer"), await auth("admin")
    a = (await client.get(f"{API}/me/achievements", headers=op)).json()
    assert a["earned"] == 4 and len(a["badges"]) == 6 and a["goal"]["target"] == 3
    steady = next(b for b in a["badges"] if b["code"] == "steady_hands")
    assert steady["progress"] >= 46 and steady["earned_at"] is None
    r = (await client.post(f"{API}/me/onboarding/practice-stop", headers=eng)).json()
    assert r["badge_earned"] is True and r["onboarding"]["practice_stop_done"] is True
    assert (await client.post(f"{API}/me/onboarding/practice-stop", headers=eng)).json()["badge_earned"] is False
    notes = (await client.get(f"{API}/me/notifications", headers=eng)).json()
    assert any(n["kind"] == "badge" and n["title"] == "New badge: Safety First" for n in notes)
    assert (await client.get(f"{API}/shift-goals/current", headers=eng)).json()["goal_text"].startswith("3 prints")
    assert (await client.get(f"{API}/audit", headers=op)).status_code == 403
    log = (await client.get(f"{API}/audit?action=onboarding", headers=adm)).json()
    assert log and log[0]["action"] == "onboarding.practice_stop" and log[0]["user_email"] == "engineer@prime.demo"


async def _open_alert(session_id, seconds_ago=3.0):
    async with SessionLocal() as db:
        a = Alert(session_id=session_id, layer_no=5, signal=Signal.sll_width, kind=AlertKind.out_of_range,
                  severity=Severity.warning, message="Layer width 18.05 mm is below target (19.5 ± 1).",
                  value=18.05, threshold=18.5, status=AlertStatus.open,
                  raised_at=datetime.now(timezone.utc) - timedelta(seconds=seconds_ago))
        db.add(a)
        await db.commit()
        return a.id


async def test_first_catch_alert_context_and_escalation_receipt(client, auth):
    op, eng = await auth("operator"), await auth("engineer")
    sessions = (await client.get(f"{API}/sessions", headers=op)).json()
    demo = next(s for s in sessions if s["scenario_name"] == "demo")
    aid = await _open_alert(demo["id"])
    rows = (await client.get(f"{API}/alerts?status=open", headers=op)).json()
    row = next(x for x in rows if x["id"] == str(aid))
    assert row["job_name"] == "Wall Panel WP-03" and row["printer_name"] == "Gantry-02"
    assert (await client.post(f"{API}/alerts/{aid}/acknowledge", headers=eng)).status_code == 200
    async with SessionLocal() as db:
        u = await db.scalar(select(User).where(User.email == "engineer@prime.demo"))
        ub = await db.scalar(select(UserBadge).join(Badge).where(UserBadge.user_id == u.id,
                                                                 Badge.code == "first_catch"))
    assert ub is not None and ub.earned_at is not None
    row = next(x for x in (await client.get(f"{API}/alerts", headers=op)).json() if x["id"] == str(aid))
    assert row["acknowledged_by_name"] == "Demo Engineer"
    # escalation -> engineer opens the AI page -> operator hears "Demo is reviewing"
    assert (await client.post(f"{API}/sessions/{demo['id']}/escalate", headers=op, json={})).status_code == 200
    assert (await client.post(f"{API}/sessions/{demo['id']}/escalations/seen", headers=op)).status_code == 403
    assert (await client.post(f"{API}/sessions/{demo['id']}/escalations/seen", headers=eng)).json() == {"answered": 1}
    notes = (await client.get(f"{API}/me/notifications", headers=op)).json()
    assert any(n["title"] == "Demo is reviewing" for n in notes)


async def test_demo_reset_finishes(client, auth):
    """Regression: the admin check's open read transaction used to block the reset's TRUNCATE forever."""
    import asyncio
    adm = await auth("admin")
    r = await asyncio.wait_for(client.post(f"{API}/demo/reset", headers=adm), timeout=120)
    assert r.status_code == 200 and r.json()["ok"] is True
    async with SessionLocal() as db:
        assert (await db.scalar(select(User).where(User.email == "maya@prime.demo"))) is not None
