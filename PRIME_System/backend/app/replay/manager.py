"""Owns all SessionRunners: start/pause/resume/stop, restart recovery, demo controls, backfill."""
from __future__ import annotations

import asyncio
import contextlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.audit import audit
from app.core.errors import APIError, conflict, not_found
from app.db import SessionLocal
from app.models import ControlAction, ControlEvent, PrintSession, Printer, Sensor, SessionStatus
from app.replay.runner import SessionRunner
from app.ws.hub import hub

ACTIVE = (SessionStatus.prechecking, SessionStatus.running, SessionStatus.paused)
TRANSITIONS = {
    ControlAction.start: ({SessionStatus.scheduled}, SessionStatus.prechecking),
    ControlAction.pause: ({SessionStatus.running, SessionStatus.prechecking}, SessionStatus.paused),
    ControlAction.resume: ({SessionStatus.paused}, SessionStatus.running),
    ControlAction.stop: ({SessionStatus.running, SessionStatus.paused, SessionStatus.prechecking},
                         SessionStatus.stopped),
}
# hooks registered by later phases (e.g. ML inference on every checkpoint)
RUNNER_SETUP_HOOKS: list = []


class RunnerManager:
    def __init__(self) -> None:
        self.runners: dict[uuid.UUID, SessionRunner] = {}
        self._bg: set[asyncio.Task] = set()

    def get(self, session_id: uuid.UUID) -> SessionRunner | None:
        return self.runners.get(session_id)

    async def _spawn(self, session_id: uuid.UUID) -> SessionRunner:
        r = SessionRunner(session_id)
        await r.load()
        for hook in RUNNER_SETUP_HOOKS:
            hook(r)
        self.runners[session_id] = r
        r.task = asyncio.create_task(r.run_live(), name=f"runner-{session_id}")
        r.task.add_done_callback(lambda _t, sid=session_id: self._done(sid))
        return r

    def _done(self, session_id: uuid.UUID) -> None:
        r = self.runners.get(session_id)
        if r is not None and r.status not in ACTIVE:
            self.runners.pop(session_id, None)

    async def control(self, session_id: uuid.UUID, action: ControlAction, user_id: uuid.UUID,
                      reason: str | None = None, request=None) -> PrintSession:
        allowed, new_status = TRANSITIONS[action]
        async with SessionLocal() as db:
            s = await db.get(PrintSession, session_id)
            if s is None:
                raise not_found("Session")
            if s.status not in allowed:
                raise conflict("INVALID_TRANSITION", f"Cannot {action.value} a session that is {s.status.value}",
                               status=s.status.value)
            if action == ControlAction.start:
                busy = await db.scalar(select(PrintSession).where(
                    PrintSession.printer_id == s.printer_id, PrintSession.status.in_(ACTIVE),
                    PrintSession.id != s.id))
                if busy is not None:
                    raise conflict("PRINTER_BUSY", "Another print is already active on this printer")
                s.started_at = datetime.now(timezone.utc)
                for sensor in (await db.scalars(select(Sensor).where(Sensor.printer_id == s.printer_id))).all():
                    sensor.status, sensor.last_seen_at = "live", s.started_at
            before = s.status
            s.status = new_status
            expired = []
            if action == ControlAction.stop:     # open AI suggestions can no longer be applied
                from app.models import Recommendation, RecStatus
                expired = (await db.scalars(select(Recommendation).where(
                    Recommendation.session_id == s.id, Recommendation.status == RecStatus.pending))).all()
                for rec in expired:
                    rec.status = RecStatus.expired
            if action == ControlAction.stop:
                s.ended_at = datetime.now(timezone.utc)
            db.add(ControlEvent(session_id=s.id, action=action, user_id=user_id, at=datetime.now(timezone.utc),
                                layer_no=s.current_layer, reason=reason))
            audit(db, user_id, f"session.{action.value}", "print_session", s.id, {"status": before},
                  {"status": new_status, "reason": reason}, request)
            await db.commit()
            await db.refresh(s)
            printer = await db.get(Printer, s.printer_id)
        runner = self.runners.get(session_id)
        if action == ControlAction.start:
            runner = await self._spawn(session_id)
        elif runner is not None:
            runner.status = new_status          # the loop sees this within one tick (<= 0.1 s at 10x)
            if action in (ControlAction.resume, ControlAction.stop):
                runner.auto_paused = False
            if action == ControlAction.stop:     # acknowledge now; close the open layer in the background
                t = asyncio.create_task(self._finalize(runner))
                self._bg.add(t)
                t.add_done_callback(self._bg.discard)
        elif action == ControlAction.stop:       # no runner in memory: still produce the report
            from app.reports.service import on_session_end
            t = asyncio.create_task(on_session_end(session_id))
            self._bg.add(t)
            t.add_done_callback(self._bg.discard)
        if expired:
            from app.ml.recommend import publish_rec
            for rec in expired:
                await publish_rec(rec, printer.site_id)
        payload = {"status": new_status.value, "by": str(user_id), "action": action.value, "reason": reason}
        await hub.publish(f"session:{session_id}", "control", payload, session_id=str(session_id))
        await hub.publish(f"site:{printer.site_id}", "control", {"session_id": str(session_id), **payload},
                          session_id=str(session_id))
        return s

    @staticmethod
    async def _finalize(runner: SessionRunner) -> None:
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(runner.finished.wait(), timeout=5)
        runner._close_segment()
        runner._close_layer()
        await runner.flush()
        from app.reports.service import on_session_end
        await on_session_end(runner.session_id, notify_users=runner.publish)

    async def resume_active(self) -> int:
        async with SessionLocal() as db:
            ids = (await db.scalars(select(PrintSession.id).where(PrintSession.status.in_(ACTIVE)))).all()
        for sid in ids:
            await self._spawn(sid)
        return len(ids)

    async def autostart_background(self, system_user_id: uuid.UUID | None) -> None:
        async with SessionLocal() as db:
            ids = (await db.scalars(select(PrintSession.id).where(
                PrintSession.status == SessionStatus.scheduled, PrintSession.scenario_name == "background"))).all()
        for sid in ids:
            if system_user_id is not None:
                with contextlib.suppress(APIError):
                    await self.control(sid, ControlAction.start, system_user_id, reason="background replay")

    async def shutdown(self) -> None:
        for t in list(self._bg):
            with contextlib.suppress(Exception):
                await t
        for r in list(self.runners.values()):
            if r.task and not r.task.done():
                r.task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await r.task
        self.runners.clear()


manager = RunnerManager()


async def backfill(session_id: uuid.UUID, base_time: datetime) -> None:
    """Replays a whole dataset instantly with historical timestamps (seed: yesterday's completed print).
    The session's engineer 'accepts' every AI suggestion so the history has a realistic decision log."""
    from app.models import User
    r = SessionRunner(session_id, publish=False, base_time=base_time)
    await r.load()
    for hook in RUNNER_SETUP_HOOKS:
        hook(r)
    if r.engineer_id is not None:
        async with SessionLocal() as db:
            r.auto_decide_user = await db.get(User, r.engineer_id)
    await r.run_fast()
    async with SessionLocal() as db:
        s = await db.get(PrintSession, session_id)
        s.status, s.ended_at = SessionStatus.completed, r._now()
        await db.commit()
    from app.reports.service import on_session_end
    await on_session_end(session_id, notify_users=False)
