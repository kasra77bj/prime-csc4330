from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.db import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # T2.1 will load models into app.state.models here; T1.3 will resume active SessionRunners.
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="PRIME API", version="0.1.0", lifespan=lifespan,
                  docs_url="/docs", openapi_url="/api/v1/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","),
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.get("/api/v1/health", tags=["meta"])
    async def health() -> dict:
        async with engine.connect() as conn:
            db_ok = (await conn.execute(text("select 1"))).scalar() == 1
        return {"status": "ok", "db": db_ok, "demo_mode": settings.demo_mode}

    return app


app = create_app()
