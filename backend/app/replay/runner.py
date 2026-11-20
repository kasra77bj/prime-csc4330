"""Replay engine (docs/14 section 4, docs/17 section 1, task T1.3).

One `SessionRunner` per active print session replays a processed dataset (1 row = 1 s of print time) as if it
were live: it persists readings, opens/closes layers and vision checkpoints, evaluates alerts, applies
engineer adjustments at the next layer start, switches to the scenario's branch dataset when nobody acted, and
publishes everything on the WebSocket hub.

Determinism: the output depends only on dataset + scenario + the sequence of (layer, adjustment) inputs.
Wall-clock time is used only for pacing and for the `ts` column in live mode.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import insert, select, update

from app.alerts.engine import AlertEngine, AlertRules, load_limits
from app.config import get_settings
from app.db import SessionLocal
from app.models import (AdjustParam, Adjustment, Checkpoint, Dataset, Layer, Printer, PrintJob, PrintSession,
                        Reading, SessionStatus, Signal, ValueSource)
from app.replay.scenario import Scenario, apply_pump_override, apply_speed_override, load_scenario
from app.ws.hub import hub

log = logging.getLogger("prime.replay")
SIGNAL_COLS = ["temperature", "pump_rpm", "voltage", "current", "duty", "motor_power", "print_speed",
               "sll_width", "sll_height", "total_height", "flow"]
CheckpointHook = Callable[["SessionRunner", object, Checkpoint], Awaitable[None]]


def _clean(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "item"):
        v = v.item()
    return v


def load_rows(processed_file: str) -> list[dict]:
    df = pd.read_parquet(get_settings().data_dir / processed_file)
    return [{k: _clean(v) for k, v in r.items()} for r in df.to_dict("records")]


@dataclass
class _Seg:
    layer: int
    checkpoint: int
    rows: list[dict] = field(default_factory=list)


def _mean(rows: list[dict], key: str) -> float | None:
    vals = [r[key] for r in rows if r.get(key) is not None]
    return sum(vals) / len(vals) if vals else None


class SessionRunner:
    def __init__(self, session_id: uuid.UUID, publish: bool = True, base_time: datetime | None = None):
        self.session_id = session_id
        self.publish = publish
        self.base_time = base_time            # backfill: ts = base_time + sim_t; live: ts = now
        self.status = SessionStatus.scheduled
        self.task: asyncio.Task | None = None
        self.checkpoint_hooks: list[CheckpointHook] = []
        self.channel = f"session:{session_id}"
        # replay state
        self.rows: list[dict] = []
        self.branch_rows: list[dict] | None = None
        self.branch_active = False
        self.cursor = 0
        self.sim_t = 0.0
        self.layer = 0
        self.layer_open: int | None = None
        self.layer_ids: dict[int, uuid.UUID] = {}
        self.layer_rows: list[dict] = []
        self.seg: _Seg | None = None
        self.last_row: dict | None = None
        self.overrides: dict[str, tuple[float, int]] = {}      # param -> (value, layer it applies to)
        self.delay_override: tuple[int, int] | None = None     # (minutes, layer)
        self.extra_delay_left = 0
        self.extra_delay_layer: int | None = None
        self.pending: list[tuple[str, float, uuid.UUID, int]] = []  # (param, value, adjustment_id, requested_layer)
        self.adjusted: dict[str, int] = {}                     # param -> earliest requested_at_layer
        self.triggers: dict[str, dict] = {}                    # signal -> {mode, value, until}
        self.events: list[tuple] = []
        self.speed_override: float | None = None
        self.finished = asyncio.Event()

    # ------------------------------------------------------------------ setup
    async def load(self) -> None:
        async with SessionLocal() as db:
            s = await db.get(PrintSession, self.session_id)
            if s is None:
                raise ValueError("session not found")
            self.job = await db.get(PrintJob, s.job_id)
            self.printer = await db.get(Printer, s.printer_id)
            self.scenario: Scenario = load_scenario(s.scenario_name)
            ds = await db.get(Dataset, s.dataset_id)
            self.rows = load_rows(ds.processed_file)
            if self.scenario.branch:
                bds = await db.scalar(select(Dataset).where(Dataset.name == self.scenario.branch.dataset))
                if bds is not None:
                    self.branch_rows = load_rows(bds.processed_file)
            self.speed = s.replay_speed or self.scenario.speed
            self.status = s.status
            self.cursor = s.replay_cursor or 0
            self.sim_t = s.sim_time_s or 0.0
            self.layer = s.current_layer or 0
            self.operator_id, self.engineer_id = s.operator_id, s.engineer_id
            hub.set_seq(self.channel, s.last_seq or 0)
            for adj in (await db.scalars(select(Adjustment).where(Adjustment.session_id == self.session_id)
                                         .order_by(Adjustment.created_at))).all():
                p = adj.parameter.value
                self.adjusted[p] = min(self.adjusted.get(p, 10 ** 6), adj.requested_at_layer)
                if adj.applied_at_layer is None:
                    self.pending.append((p, adj.to_value, adj.id, adj.requested_at_layer))
            for lay in (await db.scalars(select(Layer).where(Layer.session_id == self.session_id))).all():
                self.layer_ids[lay.layer_no] = lay.id
            b = self.scenario.branch
            if b and self.branch_rows and self.layer >= b.from_layer and not self._acted(b):
                self.rows, self.branch_active = self.branch_rows, True
            targets = {Signal.sll_width: (self.job.target_layer_width_mm, self.job.width_tolerance_mm),
                       Signal.sll_height: (self.job.target_layer_height_mm, self.job.height_tolerance_mm)}
            limits = await load_limits(db, s.printer_id, s.job_id, targets)
            self.alerts = AlertEngine(self.session_id, self.printer.site_id, s.operator_id, s.engineer_id,
                                      AlertRules(limits), publish=self.publish)
            await self.alerts.restore(db)
            self.limits = limits

    def _acted(self, b) -> bool:
        return self.adjusted.get(b.unless_adjusted, 10 ** 6) <= b.decide_by_layer

    # --------------------------------------------------------------- controls
    def queue_adjustment(self, param: str, value: float, adjustment_id: uuid.UUID, requested_at_layer: int) -> None:
        self.adjusted[param] = min(self.adjusted.get(param, 10 ** 6), requested_at_layer)
        self.pending.append((param, value, adjustment_id, requested_at_layer))

    def trigger(self, signal: str, mode: str, seconds: float, value: float | None = None) -> None:
        self.triggers[signal] = {"mode": mode, "value": value, "until": self.sim_t + seconds}

    def jump_to_layer(self, layer: int) -> None:
        for i, r in enumerate(self.rows):
            if r["layer"] >= layer and r["phase"] == "printing":
                self.cursor = i
                return

    # ------------------------------------------------------------ row engine
    def _now(self) -> datetime:
        if self.base_time is not None:
            return self.base_time + timedelta(seconds=self.sim_t)
        return datetime.now(timezone.utc)

    def _peek(self) -> dict | None:
        return self.rows[self.cursor] if self.cursor < len(self.rows) else None

    def _maybe_branch(self, nxt: dict) -> dict | None:
        b = self.scenario.branch
        if b and self.branch_rows and not self.branch_active and nxt["layer"] >= b.from_layer \
                and not self._acted(b):
            self.rows, self.branch_active = self.branch_rows, True
            self.cursor = next(i for i, r in enumerate(self.rows) if r["layer"] >= nxt["layer"])
            self.events.append(("scenario", {"event": "branch", "dataset": b.dataset, "from_layer": nxt["layer"]}))
            return self._peek()
        return nxt

    def _take(self) -> dict | None:
        """Next row to process (dataset row or a synthetic extra-delay row)."""
        nxt = self._peek()
        if self.extra_delay_left > 0 and (nxt is None or nxt["phase"] == "printing") and self.last_row:
            self.extra_delay_left -= 1
            r = dict(self.last_row)
            r["source"] = ValueSource.adjusted.value
            return r
        if nxt is None:
            return None
        nxt = self._maybe_branch(nxt)
        if nxt is None:
            return None
        self.cursor += 1
        r = dict(nxt)
        r["source"] = ValueSource.recorded.value
        return r

    def process_row(self) -> bool:
        """Processes one row into self.events. Returns False when the dataset is exhausted."""
        r = self._take()
        if r is None:
            self._close_segment()
            self._close_layer()
            return False
        self.sim_t += 1.0
        layer, printing = int(r["layer"]), r["phase"] == "printing"
        if printing and self.layer_open != layer:
            self._close_segment()
            self._close_layer()
            self._open_layer(layer)
        # overrides active for this layer
        if printing:
            ov = self.overrides.get("pump_rpm")
            if ov and ov[1] == layer:
                apply_pump_override(r, ov[0], self.scenario)
                r["source"] = ValueSource.adjusted.value
            ov = self.overrides.get("print_speed")
            if ov and ov[1] <= layer:
                apply_speed_override(r, ov[0], self.scenario)
                r["source"] = ValueSource.adjusted.value
        recorded_delay = r.get("delay_setting_min")
        if not printing and self.delay_override and self.delay_override[1] == layer:
            r["delay_setting_min"] = self.delay_override[0]
        for sig, trg in list(self.triggers.items()):
            if self.sim_t > trg["until"]:
                del self.triggers[sig]
                continue
            r[sig] = None if trg["mode"] == "drop" else trg["value"]
            r["source"] = ValueSource.scenario_override.value
        self.layer = layer
        if printing:
            key = (layer, r.get("checkpoint"))
            if self.seg is None or (self.seg.layer, self.seg.checkpoint) != key:
                self._close_segment()
                self.seg = _Seg(layer, int(r.get("checkpoint") or 1))
            self.seg.rows.append(r)
            self.layer_rows.append(r)
        else:
            if self.seg is not None:
                self._close_segment()
            if self.layer_open is not None:
                self._close_layer()
            self._maybe_extend_delay(layer, recorded_delay)
        r["sim_t_s"] = self.sim_t
        r["ts"] = self._now()
        self.last_row = r
        self.events.append(("reading", r))
        decisions = self.alerts.rules.evaluate(r, printing)
        if decisions:
            self.events.append(("alerts", decisions, layer, r["ts"]))
        return True

    def _maybe_extend_delay(self, layer: int, recorded_delay) -> None:
        """A longer delay than recorded: append synthetic delay rows after the recorded ones."""
        nxt = self._peek()
        last_delay_row = nxt is None or nxt["phase"] == "printing" or nxt["layer"] != layer
        if last_delay_row and self.delay_override and self.delay_override[1] == layer \
                and self.extra_delay_layer != layer and recorded_delay is not None:
            extra = max(0, (self.delay_override[0] - int(recorded_delay)) * 60)
            self.extra_delay_left, self.extra_delay_layer = extra, layer

    def _open_layer(self, layer: int) -> None:
        self.layer_open, self.layer_rows = layer, []
        # adjustments queued earlier take effect at this layer start
        still = []
        for item in self.pending:
            param, value, adj_id, req = item
            if param == AdjustParam.interlayer_delay.value or layer <= req:
                still.append(item)
                continue
            self.overrides[param] = (value, layer)
            self.events.append(("applied", adj_id, param, value, layer))
        self.pending = still
        self.events.append(("layer_start", layer, self._now()))

    def _close_layer(self) -> None:
        if self.layer_open is None:
            return
        layer = self.layer_open
        rows = self.layer_rows
        # a queued delay change applies to the delay right after this layer
        still = []
        for item in self.pending:
            param, value, adj_id, req = item
            if param == AdjustParam.interlayer_delay.value and layer >= req:
                self.delay_override = (int(value), layer)
                self.events.append(("applied", adj_id, param, value, layer))
            else:
                still.append(item)
        self.pending = still
        lim = self.limits.get(Signal.sll_width)
        widths = [r["sll_width"] for r in rows if r.get("sll_width") is not None]
        within = bool(widths) and lim is not None and all(
            (lim.normal_min is None or w >= lim.normal_min) and (lim.normal_max is None or w <= lim.normal_max)
            for w in widths)
        delay = self.delay_override[0] if self.delay_override and self.delay_override[1] == layer else \
            (rows[-1].get("delay_setting_min") if rows else None)
        self.events.append(("layer_end", layer, self._now(), {
            "measured_width_mm": _mean(rows, "sll_width"), "measured_height_mm": _mean(rows, "sll_height"),
            "total_height_mm": rows[-1].get("total_height") if rows else None,
            "avg_rpm": _mean(rows, "pump_rpm"), "avg_speed": _mean(rows, "print_speed"),
            "avg_temperature": _mean(rows, "temperature"), "avg_motor_power": _mean(rows, "motor_power"),
            "within_tolerance": within, "interlayer_delay_min": delay}))
        self.layer_open, self.layer_rows = None, []

    def _close_segment(self) -> None:
        if self.seg is None or not self.seg.rows:
            self.seg = None
            return
        rows = self.seg.rows
        agg = {k: _mean(rows, k) for k in ("sll_width", "sll_height", "temperature", "motor_power",
                                            "print_speed", "flow", "pump_rpm")}
        self.events.append(("checkpoint", self.seg.layer, self.seg.checkpoint, rows[-1]["ts"], agg))
        self.seg = None

    # ------------------------------------------------------------------ flush
    async def flush(self) -> None:
        events, self.events = self.events, []
        if not events:
            return
        readings, to_publish, other_pub = [], [], []
        async with SessionLocal() as db:
            for ev in events:
                kind = ev[0]
                if kind == "reading":
                    r = ev[1]
                    seq = hub.next_seq(self.channel)
                    rec = {"session_id": self.session_id, "seq": seq, "ts": r["ts"], "sim_t_s": r["sim_t_s"],
                           "layer": int(r["layer"]), "checkpoint": r.get("checkpoint"), "phase": r["phase"],
                           "delay_setting_min": r.get("delay_setting_min"), "source": r["source"],
                           **{c: r.get(c) for c in SIGNAL_COLS}}
                    readings.append(rec)
                    to_publish.append(rec)
                elif kind == "layer_start":
                    _, layer, ts = ev
                    if layer not in self.layer_ids:
                        lay = Layer(session_id=self.session_id, layer_no=layer, started_at=ts)
                        db.add(lay)
                        await db.flush()
                        self.layer_ids[layer] = lay.id
                    other_pub.append(("layer_started", {"layer": layer}))
                elif kind == "layer_end":
                    _, layer, ts, vals = ev
                    await db.execute(update(Layer).where(Layer.id == self.layer_ids[layer])
                                     .values(ended_at=ts, **vals))
                    other_pub.append(("layer_completed", {"layer": layer, **vals}))
                elif kind == "checkpoint":
                    _, layer, cp_no, ts, agg = ev
                    if None in (agg["sll_width"], agg["sll_height"], agg["motor_power"], agg["print_speed"]):
                        continue
                    cp = Checkpoint(layer_id=self.layer_ids[layer], session_id=self.session_id,
                                    checkpoint_no=cp_no, ts=ts, sll_width_mm=agg["sll_width"],
                                    sll_height_mm=agg["sll_height"], temperature=agg["temperature"] or 0.0,
                                    motor_power=agg["motor_power"], print_speed=agg["print_speed"],
                                    flow=agg["flow"] or 0.0, pump_rpm=agg["pump_rpm"] or 0.0)
                    db.add(cp)
                    await db.flush()
                    other_pub.append(("checkpoint", {"layer": layer, "checkpoint": cp_no, "id": str(cp.id),
                                                     **{k: v for k, v in agg.items()}}))
                    for hook in self.checkpoint_hooks:
                        await hook(self, db, cp)
                elif kind == "alerts":
                    _, decisions, layer, ts = ev
                    await self.alerts.apply(db, decisions, layer, ts)
                elif kind == "applied":
                    _, adj_id, param, value, layer = ev
                    await db.execute(update(Adjustment).where(Adjustment.id == adj_id)
                                     .values(applied_at_layer=layer))
                    other_pub.append(("adjustment", {"id": str(adj_id), "parameter": param, "to_value": value,
                                                     "applied_at_layer": layer, "status": "applied"}))
                elif kind == "scenario":
                    other_pub.append(("scenario", ev[1]))
            if readings:
                await db.execute(insert(Reading), readings)
            last = self.last_row or {}
            await db.execute(update(PrintSession).where(PrintSession.id == self.session_id).values(
                replay_cursor=self.cursor, sim_time_s=self.sim_t, current_layer=self.layer,
                current_rpm=last.get("pump_rpm") if last.get("phase") == "printing" else None,
                current_speed=last.get("print_speed"), current_delay_min=last.get("delay_setting_min"),
                last_seq=hub.seqs.get(self.channel, 0)))
            await db.commit()
        if not self.publish:
            return
        sid = str(self.session_id)
        printing = [r for r in to_publish if r["phase"] == "printing"]
        send = printing if printing else to_publish[-1:]
        for rec in send:
            data = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in rec.items()
                    if k not in ("session_id",)}
            msg = hub.envelope(self.channel, "reading", data, seq=rec["seq"], session_id=sid)
            hub.buffers.setdefault(self.channel, deque(maxlen=2000)).append(msg)
            for c in list(hub.subs.get(self.channel, ())):
                if not await c.send(msg):
                    hub.unsubscribe_all(c)
        if to_publish:
            last = to_publish[-1]
            await hub.publish(f"site:{self.printer.site_id}", "session_reading", {
                "session_id": sid, "printer_id": str(self.printer.id), "layer": last["layer"],
                "phase": last["phase"], **{c: last.get(c) for c in SIGNAL_COLS},
                "delay_setting_min": last.get("delay_setting_min")}, session_id=sid)
        for typ, data in other_pub:
            await hub.publish(self.channel, typ, data, session_id=sid)

    # ------------------------------------------------------------------ loops
    async def run_live(self) -> None:
        try:
            if self.status == SessionStatus.prechecking:
                await asyncio.sleep(self.scenario.precheck_seconds)
                if self.status == SessionStatus.prechecking:
                    await self._set_status(SessionStatus.running, None)
            while self.status in (SessionStatus.running, SessionStatus.paused):
                t0 = time.monotonic()
                if self.status == SessionStatus.running:
                    nxt = self._peek()
                    n = 1 if (nxt is None or nxt["phase"] == "printing") else \
                        max(1, int(self.scenario.delay_compression))
                    alive = True
                    for _ in range(n):
                        alive = self.process_row()
                        if not alive:
                            break
                        nn = self._peek()
                        if nn is not None and nn["phase"] == "printing" and self.extra_delay_left == 0:
                            break
                    await self.flush()
                    if not alive:
                        await self._set_status(SessionStatus.completed, None)
                        break
                speed = self.speed_override or self.speed
                await asyncio.sleep(max(0.0, 1.0 / speed - (time.monotonic() - t0)))
        except asyncio.CancelledError:
            with contextlib.suppress(Exception):
                await self.flush()
            raise
        except Exception:
            log.exception("runner %s crashed", self.session_id)
            await self._set_status(SessionStatus.aborted, None)
        finally:
            self.finished.set()

    async def run_fast(self, max_layer: int | None = None, flush_every: int = 300) -> None:
        """Process rows without pacing (backfill, tests)."""
        n = 0
        while True:
            nxt = self._peek()
            if max_layer is not None and nxt is not None and nxt["layer"] > max_layer \
                    and self.extra_delay_left == 0:
                break
            if not self.process_row():
                break
            n += 1
            if n % flush_every == 0:
                await self.flush()
        await self.flush()

    async def _set_status(self, status: SessionStatus, user_id: uuid.UUID | None) -> None:
        self.status = status
        now = datetime.now(timezone.utc)
        values: dict = {"status": status}
        if status in (SessionStatus.completed, SessionStatus.stopped, SessionStatus.aborted):
            self._close_segment()
            self._close_layer()
            await self.flush()
            values["ended_at"] = self._now() if self.base_time else now
        async with SessionLocal() as db:
            await db.execute(update(PrintSession).where(PrintSession.id == self.session_id).values(**values))
            await db.commit()
        if self.publish:
            await hub.publish(self.channel, "control", {"status": status.value, "by": str(user_id) if user_id else None},
                              session_id=str(self.session_id))
            await hub.publish(f"site:{self.printer.site_id}", "control",
                              {"session_id": str(self.session_id), "status": status.value},
                              session_id=str(self.session_id))
