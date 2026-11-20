import pyotp

from tests.conftest import login


async def test_login_requires_second_factor_and_totp_works(client):
    r = await client.post("/api/v1/auth/login", json={"email": "admin@prime.demo", "password": "admin123"})
    body = r.json()
    assert r.status_code == 200 and body["mfa_required"] and body["access_token"] is None
    code = pyotp.TOTP("ADMINPRIMEDEMOPRIMEDEMOSECRETKEY").now()
    r = await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": body["mfa_token"], "code": code})
    assert r.status_code == 200
    tok = r.json()["access_token"]
    me = (await client.get("/api/v1/me", headers={"Authorization": f"Bearer {tok}"})).json()
    assert me["email"] == "admin@prime.demo" and me["role"] == "admin" and "manage_users" in me["permissions"]


async def test_demo_code_and_single_use_mfa_token(client):
    r = await client.post("/api/v1/auth/login", json={"email": "engineer@prime.demo", "password": "engineer123"})
    t = r.json()["mfa_token"]
    assert (await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": t, "code": "246810"})).status_code == 200
    again = await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": t, "code": "246810"})
    assert again.status_code == 401 and again.json()["error"]["code"] == "MFA_TOKEN_USED"


async def test_wrong_code_and_lockout(client):
    r = await client.post("/api/v1/auth/login", json={"email": "admin@prime.demo", "password": "admin123"})
    bad = await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": "000000"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "BAD_CODE"
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json={"email": "admin@prime.demo", "password": "nope"})
    assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": "admin@prime.demo", "password": "admin123"})
    assert r.status_code == 423 and r.json()["error"]["code"] == "ACCOUNT_LOCKED"


async def test_refresh_rotation_and_remember_device(client):
    r = await client.post("/api/v1/auth/login",
                          json={"email": "engineer@prime.demo", "password": "engineer123", "remember_device": True})
    r = await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": "246810"})
    assert "prime_device" in r.cookies and "prime_refresh" in r.cookies
    r1 = await client.post("/api/v1/auth/refresh")
    assert r1.status_code == 200 and r1.json()["access_token"]
    # remembered device skips the 2nd factor on the next login
    r2 = await client.post("/api/v1/auth/login", json={"email": "engineer@prime.demo", "password": "engineer123"})
    assert r2.json()["mfa_required"] is False and r2.json()["access_token"]


async def test_admin_creates_user_who_must_enroll(client):
    admin = await login(client, "admin@prime.demo", "admin123")
    r = await client.post("/api/v1/users", headers=admin,
                          json={"full_name": "Carlos M.", "email": "carlos.m@prime.lab", "role": "engineer"})
    assert r.status_code == 201
    temp = r.json()["temporary_password"]
    r = await client.post("/api/v1/auth/login", json={"email": "carlos.m@prime.lab", "password": temp})
    assert r.json()["enroll_required"] is True
    t = r.json()["mfa_token"]
    # demo code is NOT accepted for real (non @prime.demo) users
    assert (await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": t, "code": "246810"})).status_code == 409
    e = (await client.post("/api/v1/auth/mfa/enroll", json={"mfa_token": t})).json()
    assert e["otpauth_uri"].startswith("otpauth://") and "<svg" in e["qr_svg"]
    r = await client.post("/api/v1/auth/mfa/enroll/confirm",
                          json={"mfa_token": t, "code": pyotp.TOTP(e["secret"]).now()})
    assert r.status_code == 200 and r.json()["user"]["mfa_enrolled"] is True
