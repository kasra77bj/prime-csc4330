"""Scenario files (data/scenarios/*.yaml) and the per-row transformations they drive (docs/14, docs/20 section 4)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from app.config import get_settings


@dataclass
class Branch:
    dataset: str
    from_layer: int
    unless_adjusted: str
    decide_by_layer: int


@dataclass
class Scenario:
    name: str
    dataset: str | None = None
    speed: float = 10.0
    delay_compression: float = 1.0
    precheck_seconds: float = 0.0
    branch: Branch | None = None
    rpm_alpha: float = 0.8
    speed_beta: float = 0.5
    same_as_recorded_rpm: float = 3.0
    triggers: dict = field(default_factory=dict)


def load_scenario(name: str | None) -> Scenario:
    if not name:
        return Scenario(name="none")
    path: Path = get_settings().data_dir / "scenarios" / f"{name}.yaml"
    if not path.exists():
        return Scenario(name=name)
    d = yaml.safe_load(path.read_text()) or {}
    resp = d.get("adjustment_response", {}) or {}
    b = d.get("branch")
    return Scenario(
        name=d.get("scenario", name), dataset=d.get("dataset"), speed=float(d.get("speed", 10)),
        delay_compression=float(d.get("delay_compression", 1)), precheck_seconds=float(d.get("precheck_seconds", 0)),
        branch=Branch(b["dataset"], int(b["from_layer"]), b["unless_adjusted"], int(b["decide_by_layer"])) if b else None,
        rpm_alpha=float(resp.get("rpm_alpha", 0.8)), speed_beta=float(resp.get("speed_beta", 0.5)),
        same_as_recorded_rpm=float(resp.get("same_as_recorded_rpm", 3)), triggers=d.get("triggers") or {},
    )


def apply_pump_override(row: dict, new_rpm: float, sc: Scenario) -> bool:
    """Mutates row; returns True if the dataset values were transformed."""
    rec = row.get("pump_rpm") or 0.0
    row["pump_rpm"] = new_rpm
    if rec <= 0 or abs(new_rpm - rec) <= sc.same_as_recorded_rpm:
        return False
    ratio = new_rpm / rec
    if row.get("sll_width") is not None:
        row["sll_width"] = row["sll_width"] * ratio ** sc.rpm_alpha
    if row.get("duty") is not None:
        row["duty"] = row["duty"] * ratio            # pump load follows RPM -> motor power scales
    recompute_features(row)
    return True


def apply_speed_override(row: dict, new_speed: float, sc: Scenario) -> bool:
    rec = row.get("print_speed") or 0.0
    row["print_speed"] = new_speed
    if rec <= 0 or new_speed == rec:
        return False
    if row.get("sll_width") is not None:
        row["sll_width"] = row["sll_width"] * (rec / new_speed) ** sc.speed_beta
    recompute_features(row)
    return True


def recompute_features(row: dict) -> None:
    if None not in (row.get("duty"), row.get("voltage"), row.get("current")):
        row["motor_power"] = row["duty"] * row["voltage"] * row["current"]
    if None not in (row.get("print_speed"), row.get("sll_width"), row.get("sll_height")):
        row["flow"] = row["print_speed"] * row["sll_width"] * row["sll_height"]
