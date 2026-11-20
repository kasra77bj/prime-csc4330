"""Tests run against a separate database: prime_test (created if missing)."""
import os

import pytest
from sqlalchemy import create_engine, text

TEST_DB = "prime_test"
BASE = os.environ.get("TEST_DATABASE_ADMIN_URL", "postgresql+psycopg://prime:prime@localhost:5432/prime")
os.environ["DATABASE_URL"] = BASE.rsplit("/", 1)[0].replace("+psycopg", "+asyncpg") + f"/{TEST_DB}"


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
