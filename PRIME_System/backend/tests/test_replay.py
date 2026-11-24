"""Replay engine: determinism, branch logic, adjustments, control latency, restart recovery (T1.3)."""
import asyncio
import time
import uuid

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import (AdjustParam, Adjustment, AdjustSource, Alert, Layer, PrintSession, Reading, SessionStatus,
                        User)
from app.replay.runner import SessionRunner

SIG = ("layer", "phase", "pump_rpm", "sll_width", "temperature", "motor_power", "flow", "delay_setting_min", "source")


async def _clone_demo_session() -> uuid.UUID:
    """A fresh scheduled copy of the demo session (same job/printer/datasets/scenario)."""
    async with SessionLocal() as db:
        src = await db.scalar(select(PrintSession).where(PrintSession.scenario_name == "demo"))
        s = PrintSession(job_id=src.job_id, printer_id=src.printer_id, dataset_id=src.dataset_id,
                         branch_dataset_id=src.branch_dataset_id, scenario_name="demo",
                         status=SessionStatus.completed, operator_id=src.operator_id, engineer_id=src.engineer_id)
        db.add(s)
        await db.commit()
        return s.id


async def _readings(sid):
    async with SessionLocal() as db:
        rows = (await db.scalars(select(Reading).where(Reading.session_id == sid).order_by(Reading.seq))).all()
        return [tuple(getattr(r, k) for k in SIG) for r in rows]


async def _alerts(sid):
    async with SessionLocal() as db:
        return [(a.layer_no, a.signal.value, a.kind.value, a.severity.value, a.message) for a in
                (await db.scalars(select(Alert).where(Alert.session_id == sid).order_by(Alert.raised_at))).all()]


async def _run(sid, max_layer=None, before=None):
    r = SessionRunner(sid, publish=False)
    await r.load()
    if before:
        await r.run_fast(max_layer=before[0])
        before[1](r)
    await r.run_fast(max_layer=max_layer)
    return r


async def test_determinism(seeded):
    a, b = await _clone_demo_session(), await _clone_demo_session()
    await _run(a, max_layer=6)
    await _run(b, max_layer=6)
    ra, rb = await _readings(a), await _readings(b)
    assert len(ra) > 1000 and ra == rb
    assert await _alerts(a) == await _alerts(b)


async def test_layer5_width_warning_then_branch_to_critical_when_nobody_acts(seeded):
    sid = await _clone_demo_session()
    r = await _run(sid, max_layer=7)
    assert r.branch_active
    alerts = await _alerts(sid)
    width = [a for a in alerts if a[1] == "sll_width"]
    assert width[0][0] == 5 and width[0][3] in ("warning", "critical")
    assert "below target (19.5 ± 1 mm)" in width[0][4]
    assert any(a[3] == "critical" for a in width), "no-action branch must reach a critical width alert"


async def test_accepted_rpm_change_keeps_main_track_and_applies_next_layer(seeded):
    sid = await _clone_demo_session()
    async with SessionLocal() as db:
        eng = await db.scalar(select(User).where(User.email == "engineer@prime.demo"))
    holder = {}

    def act(r: SessionRunner):
        holder["adj"] = uuid.uuid4()
        r.queue_adjustment("pump_rpm", 34.0, holder["adj"], requested_at_layer=5)

    async with SessionLocal() as db:   # the adjustment row the runner will mark as applied
        adj_id = uuid.uuid4()
        db.add(Adjustment(id=adj_id, session_id=sid, parameter=AdjustParam.pump_rpm, from_value=27, to_value=34,
                          source=AdjustSource.manual, user_id=eng.id, note="test", requested_at_layer=5))
        await db.commit()

    r = SessionRunner(sid, publish=False)
    await r.load()                      # picks up the pending adjustment from the DB
    await r.run_fast(max_layer=7)
    assert not r.branch_active
    async with SessionLocal() as db:
        adj = await db.get(Adjustment, adj_id)
        assert adj.applied_at_layer == 6
        l6 = await db.scalar(select(Layer).where(Layer.session_id == sid, Layer.layer_no == 6))
        assert round(l6.avg_rpm) == 34 and l6.measured_width_mm > 18.8
        src = await db.scalar(select(func.count()).select_from(Reading).where(
            Reading.session_id == sid, Reading.layer == 6, Reading.source == "adjusted"))
        assert src > 0
    _ = act


async def test_delay_change_extends_interlayer_delay(seeded):
    sid = await _clone_demo_session()
    r = SessionRunner(sid, publish=False)
    await r.load()
    await r.run_fast(max_layer=6)
    async with SessionLocal() as db:
        n5 = await db.scalar(select(func.count()).select_from(Reading).where(
            Reading.session_id == sid, Reading.layer == 6, Reading.phase == "interlayer_delay"))
    r.queue_adjustment("pump_rpm", 34, uuid.uuid4(), 5)          # keep main track
    r.queue_adjustment("interlayer_delay", 10, uuid.uuid4(), 7)  # 5 -> 10 min after layer 7
    await r.run_fast(max_layer=7)
    async with SessionLocal() as db:
        n7 = await db.scalar(select(func.count()).select_from(Reading).where(
            Reading.session_id == sid, Reading.layer == 7, Reading.phase == "interlayer_delay"))
        lay7 = await db.scalar(select(Layer).where(Layer.session_id == sid, Layer.layer_no == 7))
    assert n5 == 300 and n7 == 600 and lay7.interlayer_delay_min == 10


async def test_control_latency_pause_and_restart_resume(client, auth):
    eng = await auth("engineer")
    s = next(x for x in (await client.get("/api/v1/sessions", headers=eng)).json() if x["scenario_name"] == "demo")
    sid = s["id"]
    r = await client.post(f"/api/v1/sessions/{sid}/start", headers=eng)
    assert r.status_code == 200 and r.json()["status"] == "prechecking"
    from app.replay.manager import manager
    runner = manager.get(uuid.UUID(sid))
    runner.speed_override = 200
    await asyncio.sleep(runner.scenario.precheck_seconds + 1.0)   # demo pre-check pause, then replay
    assert runner.status == SessionStatus.running
    t0 = time.perf_counter()
    r = await client.post(f"/api/v1/sessions/{sid}/pause", headers=eng)
    assert r.json()["status"] == "paused" and (time.perf_counter() - t0) < 0.3
    await asyncio.sleep(0.2)
    n1 = len(await _readings(uuid.UUID(sid)))
    await asyncio.sleep(0.4)
    assert len(await _readings(uuid.UUID(sid))) == n1 > 0, "no readings while paused"
    # simulate a backend crash: kill the task, start a new runner from the DB state
    cursor_before = runner.cursor
    runner.task.cancel()
    await asyncio.sleep(0.1)
    manager.runners.clear()
    from app.ws.hub import hub
    hub.reset()                          # a real restart loses in-memory sequence counters
    await manager.resume_active()
    r2 = manager.get(uuid.UUID(sid))
    assert r2.cursor == cursor_before and r2.status == SessionStatus.paused
    r = await client.post(f"/api/v1/sessions/{sid}/resume", headers=eng)
    r2.speed_override = 200
    await asyncio.sleep(0.5)
    rows = await _readings(uuid.UUID(sid))
    assert len(rows) > n1
    t0 = time.perf_counter()
    r = await client.post(f"/api/v1/sessions/{sid}/stop", headers=eng, json={"reason": "test"})
    assert r.json()["status"] == "stopped" and r.json()["latency_ms"] < 300
    async with SessionLocal() as db:
        seqs = (await db.scalars(select(Reading.seq).where(Reading.session_id == uuid.UUID(sid))
                                 .order_by(Reading.seq))).all()
    assert seqs == sorted(set(seqs)), "seq keeps increasing across the restart (no duplicates)"
    bad = await client.post(f"/api/v1/sessions/{sid}/resume", headers=eng)
    assert bad.status_code == 409 and bad.json()["error"]["code"] == "INVALID_TRANSITION"
