"""Demo controls (docs/12 section 9). Only mounted when DEMO_MODE=true; Admin only."""
from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import APIError, not_found
from app.core.rbac import Permission, require
from app.db import SessionLocal, get_db
from app.models import User
from app.replay.manager import manager
from app.ws.hub import hub

router = APIRouter(prefix="/demo", tags=["demo"])
ADMIN = require(Permission.demo_controls)


class SpeedIn(BaseModel):
    multiplier: float = Field(gt=0, le=200)


class JumpIn(BaseModel):
    layer: int = Field(ge=1)


class TriggerIn(BaseModel):
    event: str


class DisconnectIn(BaseModel):
    seconds: float = Field(default=8, gt=0, le=60)


def _runner(session_id: uuid.UUID):
    r = manager.get(session_id)
    if r is None:
        raise APIError(409, "NOT_RUNNING", "That session is not running. Start it first.")
    return r


async def _audit(user: User, action: str, entity_id: uuid.UUID | None, after: dict, request: Request) -> None:
    async with SessionLocal() as db:
        audit(db, user.id, action, "demo", entity_id, None, after, request)
        await db.commit()


@router.post("/reset")
async def reset(request: Request, user: User = Depends(ADMIN), db: AsyncSession = Depends(get_db)):
    """Stops all runners and restores the seeded demo state (about 5 s)."""
    from app.seed.seed import main as seed_main
    # the sign-in check left this request's read transaction open; TRUNCATE would wait on it forever
    await db.commit()
    await manager.shutdown()
    hub.reset()
    await asyncio.to_thread(seed_main, ["--reset", "--quiet", "--no-backfill"])
    from app.seed.seed import backfill_history
    await backfill_history()
    from app.main import start_background
    await start_background()
    return {"ok": True, "message": "Demo data restored. Sign in again (sessions were reset)."}


@router.post("/sessions/{session_id}/speed")
async def speed(session_id: uuid.UUID, body: SpeedIn, request: Request, user: User = Depends(ADMIN)):
    r = _runner(session_id)
    r.speed_override = body.multiplier
    await _audit(user, "demo.speed", session_id, body.model_dump(), request)
    return {"ok": True, "speed": body.multiplier}


@router.post("/sessions/{session_id}/jump")
async def jump(session_id: uuid.UUID, body: JumpIn, request: Request, user: User = Depends(ADMIN)):
    r = _runner(session_id)
    r.jump_to_layer(body.layer)
    await _audit(user, "demo.jump", session_id, body.model_dump(), request)
    return {"ok": True, "layer": body.layer}


@router.post("/sessions/{session_id}/trigger")
async def trigger(session_id: uuid.UUID, body: TriggerIn, request: Request, user: User = Depends(ADMIN)):
    r = _runner(session_id)
    cfg = r.scenario.triggers.get(body.event)
    if cfg is None:
        raise not_found(f"Trigger '{body.event}'")
    mode = "drop" if body.event.endswith("drop") else "set"
    r.trigger(cfg["signal"], mode, float(cfg.get("seconds", 10)), cfg.get("value"))
    await _audit(user, "demo.trigger", session_id, body.model_dump(), request)
    return {"ok": True, "event": body.event, **cfg}


@router.post("/sessions/{session_id}/disconnect")
async def disconnect(session_id: uuid.UUID, body: DisconnectIn, request: Request, user: User = Depends(ADMIN)):
    """Simulates a network drop: clients watching the session are disconnected and refused for N seconds.
    The runner keeps recording, so clients recover every missed reading when they reconnect."""
    dropped = await hub.drop_channel(f"session:{session_id}", body.seconds)
    await _audit(user, "demo.disconnect", session_id, body.model_dump(), request)
    return {"ok": True, "clients_disconnected": dropped, "seconds": body.seconds}
