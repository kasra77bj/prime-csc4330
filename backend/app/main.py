import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.api.v1 import alerts, auth, data, demo, sessions, users
from app.config import get_settings
from app.core.errors import install_error_handlers
from app.db import SessionLocal, engine
from app.models import User, UserRole
from app.replay.manager import manager
from app.ws import hub as ws_hub

log = logging.getLogger("prime")


async def start_background() -> None:
    """Demo: start the calm Arm-01 replay so the dashboard looks alive."""
    s = get_settings()
    if not (s.demo_mode and s.autostart_background):
        return
    async with SessionLocal() as db:
        admin = await db.scalar(select(User.id).where(User.role == UserRole.admin).order_by(User.email).limit(1))
    await manager.autostart_background(admin)


@asynccontextmanager
async def lifespan(app: FastAPI):
    resumed = await manager.resume_active()        # reliability NFR: survive a backend restart
    if resumed:
        log.info("resumed %d active session(s)", resumed)
    await start_background()
    # T2.1 will load the ML models into app.state here.
    yield
    await manager.shutdown()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="PRIME API", version="0.2.0", lifespan=lifespan,
                  docs_url="/docs", openapi_url="/api/v1/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","),
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    install_error_handlers(app)

    @app.get("/api/v1/health", tags=["meta"])
    async def health() -> dict:
        async with engine.connect() as conn:
            db_ok = (await conn.execute(text("select 1"))).scalar() == 1
        return {"status": "ok", "db": db_ok, "demo_mode": settings.demo_mode,
                "active_runners": len(manager.runners)}

    for r in (auth.router, users.router, sessions.router, data.router, alerts.router):
        app.include_router(r, prefix="/api/v1")
    if settings.demo_mode:
        app.include_router(demo.router, prefix="/api/v1")
    app.include_router(ws_hub.router)
    return app


app = create_app()
