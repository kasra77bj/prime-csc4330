"""Alert engine (docs/17 section 2, task T1.5).

Evaluated on every replayed reading. Pure decision logic lives in `AlertRules` (unit-testable without a DB);
`AlertEngine` persists alerts, sends notifications and publishes WebSocket events.

Rules
- out_of_range warning : outside normal range for >= 3 consecutive readings
- out_of_range critical: outside critical range for >= 2 consecutive readings (upgrades an open warning)
- rapid_change (info)  : |change over the last 60 s| > rate_limit_per_min
- sensor_lost critical : no value for >= 5 s of print time
- hysteresis           : auto-resolve after 10 consecutive in-range readings
Geometry/pump signals are only evaluated while printing (they are 0/frozen during the interlayer delay).
"""
from __future__ import annotations

import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notify import notify
from app.models import Alert, AlertKind, AlertStatus, Severity, Signal, SignalLimit
from app.ws.hub import hub

WARN_AFTER = 3
CRIT_AFTER = 2
RESOLVE_AFTER = 10
LOST_AFTER_S = 5
RATE_WINDOW_S = 60

LABELS = {
    Signal.temperature: ("Material temperature", "°C", 1),
    Signal.pump_rpm: ("Pump speed", "RPM", 0),
    Signal.motor_power: ("Motor power", "W", 2),
    Signal.voltage: ("Pump voltage", "V", 2),
    Signal.print_speed: ("Print speed", "mm/s", 0),
    Signal.sll_width: ("Layer width", "mm", 2),
    Signal.sll_height: ("Layer height", "mm", 2),
}
PRINTING_ONLY = {Signal.pump_rpm, Signal.motor_power, Signal.print_speed, Signal.sll_width, Signal.sll_height}
SENSOR_SIGNALS = {Signal.temperature}  # signals monitored for sensor loss


@dataclass
class Limit:
    normal_min: float | None
    normal_max: float | None
    critical_min: float | None
    critical_max: float | None
    rate_limit_per_min: float | None = None
    target: float | None = None
    tolerance: float | None = None


@dataclass
class Decision:
    action: str              # open | upgrade | resolve
    signal: Signal
    kind: AlertKind
    severity: Severity
    value: float | None
    threshold: float | None
    message: str


@dataclass
class _State:
    out_normal: int = 0
    out_critical: int = 0
    in_range: int = 0
    missing_s: float = 0.0
    history: deque = field(default_factory=lambda: deque(maxlen=RATE_WINDOW_S + 1))


def fmt(signal: Signal, v: float) -> str:
    _, unit, nd = LABELS[signal]
    return f"{v:.{nd}f} {unit}"


def describe(signal: Signal, v: float, lim: Limit, critical: bool) -> tuple[str, float | None]:
    name, unit, nd = LABELS[signal]
    low = (lim.critical_min if critical else lim.normal_min)
    high = (lim.critical_max if critical else lim.normal_max)
    below = low is not None and v < low
    word = "below" if below else "above"
    if lim.target is not None and lim.tolerance is not None:
        msg = (f"{name} {fmt(signal, v)} is {word} target ({lim.target:g} ± {lim.tolerance:g} {unit})"
               + (" and outside the critical limit." if critical else "."))
        if signal == Signal.sll_width:
            msg += " Check Vision." if not critical else " Consider stopping the print."
    else:
        msg = (f"{name} {fmt(signal, v)} is {word} the {'critical' if critical else 'normal'} range "
               f"({low:g}–{high:g} {unit}).")
    return msg, (low if below else high)


class AlertRules:
    """Stateful, DB-free rule evaluation. `open_` tracks (signal, kind) -> severity of open alerts."""

    def __init__(self, limits: dict[Signal, Limit]):
        self.limits = limits
        self.state: dict[Signal, _State] = {s: _State() for s in LABELS}
        self.open_: dict[tuple[Signal, AlertKind], Severity] = {}

    def evaluate(self, row: dict, printing: bool, dt_s: float = 1.0) -> list[Decision]:
        out: list[Decision] = []
        for sig, lim in self.limits.items():
            if sig not in LABELS or (sig in PRINTING_ONLY and not printing):
                continue
            st = self.state[sig]
            v = row.get(sig.value)
            # ---- sensor loss ----
            if v is None:
                if sig in SENSOR_SIGNALS:
                    st.missing_s += dt_s
                    key = (sig, AlertKind.sensor_lost)
                    if st.missing_s >= LOST_AFTER_S and key not in self.open_:
                        self.open_[key] = Severity.critical
                        out.append(Decision("open", sig, AlertKind.sensor_lost, Severity.critical, None, None,
                                            f"{LABELS[sig][0]} sensor stopped reporting "
                                            f"{int(st.missing_s)} s ago. Data is buffered; check the cable."))
                continue
            if st.missing_s and (sig, AlertKind.sensor_lost) in self.open_:
                del self.open_[(sig, AlertKind.sensor_lost)]
                out.append(Decision("resolve", sig, AlertKind.sensor_lost, Severity.critical, v, None,
                                    f"{LABELS[sig][0]} sensor reconnected."))
            st.missing_s = 0.0
            # ---- range ----
            out_n = (lim.normal_min is not None and v < lim.normal_min) or \
                    (lim.normal_max is not None and v > lim.normal_max)
            out_c = (lim.critical_min is not None and v < lim.critical_min) or \
                    (lim.critical_max is not None and v > lim.critical_max)
            st.out_normal = st.out_normal + 1 if out_n else 0
            st.out_critical = st.out_critical + 1 if out_c else 0
            st.in_range = 0 if out_n else st.in_range + 1
            key = (sig, AlertKind.out_of_range)
            cur = self.open_.get(key)
            if st.out_critical >= CRIT_AFTER and cur != Severity.critical:
                msg, thr = describe(sig, v, lim, critical=True)
                self.open_[key] = Severity.critical
                out.append(Decision("upgrade" if cur else "open", sig, AlertKind.out_of_range,
                                    Severity.critical, v, thr, msg))
            elif st.out_normal >= WARN_AFTER and cur is None:
                msg, thr = describe(sig, v, lim, critical=False)
                self.open_[key] = Severity.warning
                out.append(Decision("open", sig, AlertKind.out_of_range, Severity.warning, v, thr, msg))
            elif cur is not None and st.in_range >= RESOLVE_AFTER:
                del self.open_[key]
                out.append(Decision("resolve", sig, AlertKind.out_of_range, cur, v, None,
                                    f"{LABELS[sig][0]} back in range ({fmt(sig, v)})."))
            # ---- rapid change ----
            st.history.append(v)
            if lim.rate_limit_per_min and len(st.history) > 1:
                delta = st.history[-1] - st.history[0]
                rkey = (sig, AlertKind.rapid_change)
                if abs(delta) > lim.rate_limit_per_min and rkey not in self.open_:
                    self.open_[rkey] = Severity.info
                    word = "dropped" if delta < 0 else "rose"
                    out.append(Decision("open", sig, AlertKind.rapid_change, Severity.info, v,
                                        lim.rate_limit_per_min,
                                        f"{LABELS[sig][0]} {word} {abs(delta):.1f} {LABELS[sig][1]} "
                                        f"in the last minute (now {fmt(sig, v)})."))
                elif abs(delta) <= lim.rate_limit_per_min / 2 and rkey in self.open_ and \
                        len(st.history) == st.history.maxlen:
                    del self.open_[rkey]
                    out.append(Decision("resolve", sig, AlertKind.rapid_change, Severity.info, v, None,
                                        f"{LABELS[sig][0]} is stable again."))
        return out


async def load_limits(db: AsyncSession, printer_id: uuid.UUID, job_id: uuid.UUID,
                      job_targets: dict[Signal, tuple[float, float]]) -> dict[Signal, Limit]:
    rows = (await db.scalars(select(SignalLimit).where(SignalLimit.printer_id == printer_id))).all()
    limits: dict[Signal, Limit] = {}
    for r in sorted(rows, key=lambda r: r.job_id is not None):   # job-specific rows override defaults
        if r.job_id not in (None, job_id):
            continue
        limits[r.signal] = Limit(r.normal_min, r.normal_max, r.critical_min, r.critical_max, r.rate_limit_per_min)
    for sig, (target, tol) in job_targets.items():
        if sig in limits:
            limits[sig].target, limits[sig].tolerance = target, tol
    return limits


def alert_dict(a: Alert) -> dict:
    return {"id": str(a.id), "session_id": str(a.session_id), "layer_no": a.layer_no, "signal": a.signal.value,
            "kind": a.kind.value, "severity": a.severity.value, "message": a.message, "value": a.value,
            "threshold": a.threshold, "status": a.status.value, "raised_at": a.raised_at.isoformat(),
            "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None}


class AlertEngine:
    """Persists rule decisions for one session."""

    def __init__(self, session_id: uuid.UUID, site_id: uuid.UUID, operator_id: uuid.UUID | None,
                 engineer_id: uuid.UUID | None, rules: AlertRules, publish: bool = True):
        self.session_id, self.site_id = session_id, site_id
        self.operator_id, self.engineer_id = operator_id, engineer_id
        self.rules, self.publish = rules, publish

    async def restore(self, db: AsyncSession) -> None:
        for a in (await db.scalars(select(Alert).where(Alert.session_id == self.session_id,
                                                       Alert.status != AlertStatus.resolved))).all():
            self.rules.open_[(a.signal, a.kind)] = a.severity

    async def apply(self, db: AsyncSession, decisions: list[Decision], layer: int, now: datetime) -> list[Alert]:
        changed: list[Alert] = []
        for d in decisions:
            existing = await db.scalar(select(Alert).where(
                Alert.session_id == self.session_id, Alert.signal == d.signal, Alert.kind == d.kind,
                Alert.status != AlertStatus.resolved).order_by(Alert.raised_at.desc()).limit(1))
            if d.action == "open" and existing is None:
                a = Alert(session_id=self.session_id, layer_no=layer, signal=d.signal, kind=d.kind,
                          severity=d.severity, message=d.message, value=d.value, threshold=d.threshold,
                          status=AlertStatus.open, raised_at=now)
                db.add(a)
                await db.flush()
                changed.append(a)
                await self._notify(db, a, "opened")
            elif d.action in ("upgrade", "open") and existing is not None:
                existing.severity, existing.message, existing.value = d.severity, d.message, d.value
                existing.threshold, existing.status = d.threshold, AlertStatus.open
                existing.acknowledged_at = existing.acknowledged_by = None
                changed.append(existing)
                await self._notify(db, existing, "upgraded")
            elif d.action == "resolve" and existing is not None:
                existing.status, existing.resolved_at = AlertStatus.resolved, now
                changed.append(existing)
        for a in changed:
            if self.publish:
                await hub.publish(f"session:{self.session_id}", "alert", alert_dict(a), session_id=str(self.session_id))
                await hub.publish(f"site:{self.site_id}", "alert", alert_dict(a), session_id=str(self.session_id))
        return changed

    async def _notify(self, db: AsyncSession, a: Alert, how: str) -> None:
        if not self.publish or a.severity == Severity.info:
            return
        link = f"/prints/{self.session_id}/live?alert={a.id}"
        title = f"{'Critical' if a.severity == Severity.critical else 'Warning'}: {LABELS[a.signal][0]}"
        await notify(db, self.operator_id, "alert", title, a.message, link, {"alert_id": str(a.id)})
        if a.severity == Severity.critical:
            await notify(db, self.engineer_id, "alert", title, a.message, link, {"alert_id": str(a.id)})
