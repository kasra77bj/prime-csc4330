"""Tests run against a separate database: prime_test (created if missing)."""
import os

import pytest
from sqlalchemy import create_engine, text

TEST_DB = "prime_test"
BASE = os.environ.get("TEST_DATABASE_ADMIN_URL", "postgresql+psycopg://prime:prime@localhost:5432/prime")
os.environ["DATABASE_URL"] = BASE.rsplit("/", 1)[0].replace("+psycopg", "+asyncpg") + f"/{TEST_DB}"
os.environ["DB_NULLPOOL"] = "true"            # each test has its own event loop
os.environ["AUTOSTART_BACKGROUND"] = "false"
os.environ["DEMO_MODE"] = "true"
os.environ["JWT_SECRET"] = "test-secret-0123456789-abcdefghijklmnop"


@pytest.fixture(scope="session", autouse=True)
def test_database():
    admin = create_engine(BASE, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))
        c.execute(text(f"CREATE DATABASE {TEST_DB}"))
    admin.dispose()
    from alembic import command
    from alembic.config import Config
    here = os.path.dirname(os.path.dirname(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture
def sync_engine():
    from app.config import get_settings
    get_settings.cache_clear()
    eng = create_engine(get_settings().sync_database_url)
    yield eng
    eng.dispose()


@pytest.fixture
def seeded():
    """Fresh seeded database (with yesterday's print backfilled)."""
    from app.seed.seed import main as seed_main
    seed_main(["--reset", "--quiet"])
    from app.ws.hub import hub
    hub.reset()
    yield


@pytest.fixture
async def client(seeded):
    import httpx

    from app.main import app
    from app.replay.manager import manager
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await manager.shutdown()


async def login(client, email: str, password: str, code: str = "246810") -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    r = await client.post("/api/v1/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": code})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


CREDS = {
    "admin": ("admin@prime.demo", "admin123"),
    "engineer": ("engineer@prime.demo", "engineer123"),
    "operator": ("maya@prime.demo", "Prime!2026"),
    "manager": ("jordan@prime.demo", "Prime!2026"),
    "lead": ("kasra@prime.demo", "Prime!2026"),
}


@pytest.fixture
async def auth(client):
    """auth['engineer'] -> headers; logs in lazily."""
    cache: dict = {}

    class _A:
        async def __call__(self, role: str) -> dict:
            if role not in cache:
                cache[role] = await login(client, *CREDS[role])
            return cache[role]
    return _A()
