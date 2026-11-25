"""The permission matrix from docs/13 section 3, checked cell by cell, plus real 403s from endpoints."""
import pytest

from app.core.rbac import Permission as P
from app.core.rbac import has_permission
from app.models import UserRole as R

EXPECTED = {
    P.view_live: {R.operator, R.engineer, R.admin, R.manager, R.lead},
    P.control_session: {R.operator, R.engineer, R.lead},
    P.acknowledge_alert: {R.operator, R.engineer, R.lead},
    P.flag_frame: {R.operator, R.engineer, R.lead},
    P.escalate: {R.operator},
    P.view_raw_data: {R.engineer, R.admin, R.lead},
    P.decide_recommendation: {R.engineer, R.lead},
    P.manual_adjust: {R.engineer, R.lead},
    P.resolve_alert: {R.engineer, R.lead},
    P.manage_sessions: {R.engineer, R.admin, R.lead},
    P.view_reports: {R.engineer, R.admin, R.manager, R.lead},
    P.export_data: {R.engineer, R.manager, R.lead},
    P.manage_users: {R.admin, R.lead},
    P.demo_controls: {R.admin, R.lead},
    P.view_audit: {R.admin, R.lead},
}


@pytest.mark.parametrize("perm", list(P))
@pytest.mark.parametrize("role", list(R))
def test_matrix(perm, role):
    assert has_permission(role, perm) == (role in EXPECTED[perm])


async def _demo_session(client, headers):
    sessions = (await client.get("/api/v1/sessions", headers=headers)).json()
    return next(s for s in sessions if s["scenario_name"] == "demo")


async def test_endpoints_enforce_roles(client, auth):
    op, mgr, adm, eng = await auth("operator"), await auth("manager"), await auth("admin"), await auth("engineer")
    s = await _demo_session(client, op)
    assert (await client.get("/api/v1/users", headers=op)).status_code == 403
    assert (await client.get("/api/v1/users", headers=adm)).status_code == 200
    r = await client.get(f"/api/v1/sessions/{s['id']}/readings?raw=true", headers=op)
    assert r.status_code == 403 and r.json()["error"]["details"]["hint"] == "Engineer approval required"
    assert (await client.get(f"/api/v1/sessions/{s['id']}/readings?raw=true", headers=eng)).status_code == 200
    assert (await client.post(f"/api/v1/sessions/{s['id']}/start", headers=mgr)).status_code == 403
    assert (await client.post(f"/api/v1/sessions/{s['id']}/start", headers=adm)).status_code == 403
    assert (await client.post("/api/v1/demo/reset", headers=eng)).status_code == 403
    assert (await client.post(f"/api/v1/sessions/{s['id']}/escalate", headers=eng, json={})).status_code == 403
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_team_lead_can_start_and_manage(client, auth):
    """Kasra and Carlos (Team lead) can do everything an engineer can (start the demo print) and still manage users."""
    lead = await auth("lead")
    assert (await client.get("/api/v1/users", headers=lead)).status_code == 200
    s = await _demo_session(client, lead)
    assert (await client.get(f"/api/v1/sessions/{s['id']}/readings?raw=true", headers=lead)).status_code == 200
