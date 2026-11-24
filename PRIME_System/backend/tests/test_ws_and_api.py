"""WebSocket hub recovery, escalation, readings downsampling, dashboard (T1.4-T1.6)."""
import asyncio
import uuid

import pytest

from app.ws.hub import Connection, Hub


class FakeWS:
    def __init__(self):
        self.sent = []
        self.closed = None

    async def send_json(self, m):
        self.sent.append(m)

    async def close(self, code=1000):
        self.closed = code


async def test_hub_resume_from_last_seq_and_resync():
    h = Hub()
    for i in range(5):
        await h.publish("session:x", "reading", {"i": i})
    c = Connection(ws=FakeWS(), user_id="u", role="operator")
    await h.subscribe(c, "session:x", last_seq=2)
    got = [m.get("seq") for m in c.ws.sent if m["type"] == "reading"]
    assert got == [3, 4, 5]
    assert c.ws.sent[-1]["data"] == {"state": "live", "recovered": 3}
    small = Hub()
    import app.ws.hub as hubmod
    old = hubmod.BUFFER_SIZE
    hubmod.BUFFER_SIZE = 3
    try:
        for i in range(10):
            await small.publish("session:y", "reading", {"i": i})
    finally:
        hubmod.BUFFER_SIZE = old
    c2 = Connection(ws=FakeWS(), user_id="u", role="operator")
    await small.subscribe(c2, "session:y", last_seq=1)
    assert c2.ws.sent[0]["type"] == "resync_required"


async def test_drop_channel_blocks_then_allows():
    h = Hub()
    c = Connection(ws=FakeWS(), user_id="u", role="operator")
    await h.subscribe(c, "session:z")
    assert await h.drop_channel("session:z", 0.2) == 1 and c.ws.closed == 4001
    c2 = Connection(ws=FakeWS(), user_id="u", role="operator")
    await h.subscribe(c2, "session:z")
    assert c2.ws.closed == 4001
    await asyncio.sleep(0.25)
    c3 = Connection(ws=FakeWS(), user_id="u", role="operator")
    await h.subscribe(c3, "session:z")
    assert c3.ws.closed is None


async def test_escalation_notifies_session_engineer(client, auth):
    op = await auth("operator")
    s = next(x for x in (await client.get("/api/v1/sessions", headers=op)).json() if x["scenario_name"] == "demo")
    r = await client.post(f"/api/v1/sessions/{s['id']}/escalate", headers=op, json={"message": "Width dropping"})
    assert r.status_code == 200
    assert r.json()["engineer"]["email"] == "engineer@prime.demo"
    assert "usually responds in ~2 min" in r.json()["message"]
    eng = await auth("engineer")
    notes = (await client.get("/api/v1/me/notifications", headers=eng)).json()
    assert notes[0]["kind"] == "escalation" and "Maya Ortiz" in notes[0]["title"]


async def test_history_readings_layers_and_dashboard(client, auth):
    op = await auth("operator")
    hist = next(x for x in (await client.get("/api/v1/sessions?status=completed", headers=op)).json())
    r = (await client.get(f"/api/v1/sessions/{hist['id']}/readings?signals=sll_width,pump_rpm", headers=op)).json()
    assert r["raw"] is False and 0 < len(r["points"]) <= 600 and "sll_width" in r["points"][0]
    r = (await client.get(f"/api/v1/sessions/{hist['id']}/readings?signals=sll_width&bucket=1m", headers=op)).json()
    assert r["bucket_s"] == 60
    bad = await client.get(f"/api/v1/sessions/{hist['id']}/readings?signals=nope", headers=op)
    assert bad.status_code == 422
    layers = (await client.get(f"/api/v1/sessions/{hist['id']}/layers", headers=op)).json()
    assert len(layers) == 8 and len(layers[0]["checkpoints"]) == 4
    assert layers[2]["within_tolerance"] is False and layers[0]["within_tolerance"] is True
    frame = (await client.get(f"/api/v1/sessions/{hist['id']}/layers/3/frame", headers=op)).json()
    assert frame["width_mm"] < 18.5
    flag = await client.post(f"/api/v1/checkpoints/{frame['checkpoint_id']}/flag-artifact", headers=op)
    assert flag.status_code == 200
    summ = (await client.get("/api/v1/dashboard/summary", headers=op)).json()
    assert summ["active_prints"] == 0 and summ["ai_suggestions_pending"] == 0
    printers = (await client.get("/api/v1/printers", headers=op)).json()
    assert {p["name"] for p in printers} == {"Gantry-02", "Arm-01", "Gantry-03"}


def test_websocket_auth_and_user_channel(seeded):
    from fastapi.testclient import TestClient

    from app.core.security import access_token
    from app.main import app
    with TestClient(app) as tc:
        with pytest.raises(Exception):
            with tc.websocket_connect("/ws?token=bad") as ws:
                ws.receive_json()
        uid = uuid.uuid4()
        with tc.websocket_connect(f"/ws?token={access_token(uid, 'operator')}") as ws:
            first = ws.receive_json()
            assert first["type"] == "connection" and first["channel"] == f"user:{uid}"
            ws.send_json({"type": "ping"})
            assert ws.receive_json()["type"] == "pong"
