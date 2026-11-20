"""WebSocket hub (docs/12 section 10, task T1.4).

Channels: `session:<id>` (live print), `site:<id>` (dashboard), `user:<id>` (notifications, auto-subscribed).
Every event gets a per-channel monotonic `seq`. The hub keeps the last 2,000 events per channel so a client
that reconnects with `last_seq` receives what it missed (reliability NFR). Readings are persisted by the
runner *before* they are published, so a larger gap can always be refetched over REST.
"""
from __future__ import annotations

import asyncio
import contextlib
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_token

BUFFER_SIZE = 2000
HEARTBEAT_S = 5.0


@dataclass(eq=False)
class Connection:
    ws: WebSocket
    user_id: str
    role: str
    channels: set[str] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, msg: dict) -> bool:
        try:
            async with self.lock:
                await self.ws.send_json(msg)
            return True
        except Exception:
            return False


class Hub:
    def __init__(self) -> None:
        self.subs: dict[str, set[Connection]] = {}
        self.buffers: dict[str, deque] = {}
        self.seqs: dict[str, int] = {}
        self.blocked_until: dict[str, float] = {}

    # ---- sequence numbers ----
    def set_seq(self, channel: str, seq: int) -> None:
        self.seqs[channel] = max(self.seqs.get(channel, 0), seq)

    def next_seq(self, channel: str) -> int:
        self.seqs[channel] = self.seqs.get(channel, 0) + 1
        return self.seqs[channel]

    # ---- publish ----
    def envelope(self, channel: str, type_: str, data: Any, seq: int | None = None,
                 session_id: str | None = None) -> dict:
        return {"seq": seq if seq is not None else self.next_seq(channel), "type": type_,
                "channel": channel, "session_id": session_id,
                "ts": datetime.now(timezone.utc).isoformat(), "data": data}

    async def publish(self, channel: str, type_: str, data: Any, seq: int | None = None,
                      session_id: str | None = None) -> dict:
        msg = self.envelope(channel, type_, data, seq, session_id)
        self.buffers.setdefault(channel, deque(maxlen=BUFFER_SIZE)).append(msg)
        dead = [c for c in list(self.subs.get(channel, ())) if not await c.send(msg)]
        for c in dead:
            self.unsubscribe_all(c)
        return msg

    # ---- subscriptions ----
    async def subscribe(self, conn: Connection, channel: str, last_seq: int | None = None) -> None:
        if time.monotonic() < self.blocked_until.get(channel, 0):
            await conn.send({"type": "connection", "channel": channel, "data": {"state": "degraded"}})
            await conn.ws.close(code=4001)
            return
        self.subs.setdefault(channel, set()).add(conn)
        conn.channels.add(channel)
        buf = self.buffers.get(channel)
        if last_seq is not None and buf:
            missed = [m for m in buf if m["seq"] > last_seq]
            if missed and missed[0]["seq"] > last_seq + 1:
                await conn.send({"type": "resync_required", "channel": channel,
                                 "data": {"from_seq": last_seq, "oldest_buffered": missed[0]["seq"]}})
            else:
                for m in missed:
                    await conn.send(m)
                await conn.send({"type": "connection", "channel": channel,
                                 "data": {"state": "live", "recovered": len(missed)}})
                return
        await conn.send({"type": "connection", "channel": channel, "data": {"state": "live", "recovered": 0}})

    def unsubscribe_all(self, conn: Connection) -> None:
        for ch in conn.channels:
            self.subs.get(ch, set()).discard(conn)
        conn.channels.clear()

    async def drop_channel(self, channel: str, seconds: float) -> int:
        """Demo: simulate a network drop for everyone watching `channel`."""
        self.blocked_until[channel] = time.monotonic() + seconds
        conns = list(self.subs.get(channel, ()))
        for c in conns:
            self.unsubscribe_all(c)
            with contextlib.suppress(Exception):
                await c.ws.close(code=4001)
        return len(conns)

    def reset(self) -> None:
        self.buffers.clear()
        self.seqs.clear()
        self.blocked_until.clear()


hub = Hub()
router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = "") -> None:
    try:
        payload = decode_token(token, "access")
    except jwt.PyJWTError:
        await ws.close(code=4401)
        return
    await ws.accept()
    conn = Connection(ws=ws, user_id=payload["sub"], role=payload.get("role", ""))
    await hub.subscribe(conn, f"user:{conn.user_id}")

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_S)
            if not await conn.send({"type": "heartbeat", "ts": datetime.now(timezone.utc).isoformat()}):
                return

    hb = asyncio.create_task(heartbeat())
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "subscribe":
                channel = str(msg.get("channel", ""))
                kind, _, ident = channel.partition(":")
                try:
                    uuid.UUID(ident)
                except ValueError:
                    await conn.send({"type": "error", "data": {"message": f"bad channel {channel}"}})
                    continue
                if kind not in ("session", "site") and channel != f"user:{conn.user_id}":
                    await conn.send({"type": "error", "data": {"message": "channel not allowed"}})
                    continue
                last = msg.get("last_seq")
                await hub.subscribe(conn, channel, int(last) if last is not None else None)
            elif msg.get("type") == "unsubscribe":
                ch = str(msg.get("channel", ""))
                hub.subs.get(ch, set()).discard(conn)
                conn.channels.discard(ch)
            elif msg.get("type") == "ping":
                await conn.send({"type": "pong"})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hb.cancel()
        hub.unsubscribe_all(conn)
