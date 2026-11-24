"""Dataset ingest (task T0.3).

    python -m app.replay.source_csv ingest ../data/mappings/demo_wp03.yaml
    python -m app.replay.source_csv ingest-all

Reads a CSV/XLSX recording, maps its columns to PRIME's canonical names, recomputes the
model features with the confirmed formulas, validates, writes
`data/processed/<name>.parquet` + `data/reports/<name>.md`, and upserts a `datasets` row.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Dataset

CANONICAL = ["t_s", "layer", "checkpoint", "phase", "temperature", "pump_rpm", "voltage", "current", "duty",
             "motor_power", "print_speed", "sll_width", "sll_height", "total_height", "flow",
             "delay_setting_min", "checkpoint_mark"]
UNITS = {"t_s": "s", "temperature": "°C", "pump_rpm": "RPM", "voltage": "V", "current": "A", "duty": "%",
         "motor_power": "W", "print_speed": "mm/s", "sll_width": "mm", "sll_height": "mm",
         "total_height": "mm", "flow": "mm³/s", "delay_setting_min": "min"}
# plausible ranges (lab data + model training range); used for validation warnings only
PLAUSIBLE = {"temperature": (10, 35), "pump_rpm": (0, 120), "voltage": (10, 14), "current": (0, 2),
             "motor_power": (-10, 0.5), "print_speed": (0, 40), "sll_width": (10, 40),
             "sll_height": (5, 30), "flow": (0, 20000)}


def _col(df: pd.DataFrame, spec):
    if spec is None:
        return None
    if isinstance(spec, str):
        return df[spec]
    s = df[spec["column"]] * spec.get("scale", 1.0)
    return s + spec.get("offset", 0.0)


def load_mapped(mapping: dict, data_dir: Path) -> pd.DataFrame:
    src = data_dir / mapping["source_file"]
    raw = pd.read_excel(src) if src.suffix in (".xlsx", ".xls") else pd.read_csv(src)
    cols = mapping.get("columns", {})
    out = pd.DataFrame({k: _col(raw, v) for k, v in cols.items() if v is not None})

    derive = mapping.get("derive", {})
    if derive.get("layer_from_total_height"):
        # raw.xlsx: total height steps up once per layer
        th = out["total_height"].to_numpy()
        layer = np.ones(len(th), dtype=int)
        for i in range(1, len(th)):
            layer[i] = layer[i - 1] + (1 if th[i] - th[i - 1] > 0.5 * out["sll_height"].iloc[i] else 0)
        out["layer"] = layer
    if derive.get("checkpoint_index"):
        out["checkpoint"] = out.groupby("layer").cumcount() + 1
    if "t_s" not in out:
        out["t_s"] = np.arange(len(out), dtype=float) * derive.get("seconds_per_row", 1.0)
    if "phase" not in out:
        out["phase"] = "printing"
    for c, v in mapping.get("constants", {}).items():
        out[c] = v

    # model features, always recomputed with the confirmed formulas (docs/20)
    out["motor_power"] = out["duty"] * out["voltage"] * out["current"]
    out["flow"] = out["print_speed"] * out["sll_width"] * out["sll_height"]

    if "checkpoint_mark" not in out:            # no vision marks: the last row of each segment is the mark
        seg = out["layer"].astype(str) + ":" + out["checkpoint"].astype(str)
        out["checkpoint_mark"] = (seg != seg.shift(-1)) & (out["phase"] == "printing")
    out["checkpoint_mark"] = out["checkpoint_mark"].fillna(False).astype(bool)
    for c in CANONICAL:
        if c not in out:
            out[c] = np.nan
    out = out[CANONICAL].copy()
    out["layer"] = out["layer"].astype(int)
    out["checkpoint"] = out["checkpoint"].astype("Int64")
    return out


def validate(df: pd.DataFrame) -> list[str]:
    issues = []
    if not df["t_s"].is_monotonic_increasing:
        issues.append("time is not monotonic")
    if not df["layer"].is_monotonic_increasing:
        issues.append("layer numbers decrease somewhere")
    printing = df[df["phase"] == "printing"]
    for c, (lo, hi) in PLAUSIBLE.items():
        s = printing[c].dropna()
        bad = int(((s < lo) | (s > hi)).sum())
        if bad:
            issues.append(f"{c}: {bad} printing rows outside plausible range {lo}..{hi}")
    gaps = df["t_s"].diff().dropna()
    if len(gaps) and gaps.max() > 5 and (df["phase"] == "printing").all() and df["checkpoint"].isna().any():
        issues.append(f"largest time gap {gaps.max():.0f} s")
    return issues


def report(name: str, mapping: dict, df: pd.DataFrame, issues: list[str]) -> str:
    p = df[df["phase"] == "printing"]
    lines = [f"# Data report: `{name}`\n", f"{mapping.get('title', '')}\n",
             f"- Source: `{mapping['source_file']}` · synthetic: {mapping.get('synthetic', False)}",
             f"- Rows: {len(df)} ({len(p)} printing) · layers {df.layer.min()}–{df.layer.max()} · "
             f"duration {df.t_s.max() / 60:.1f} min\n",
             "| Signal | Unit | min | mean | max |", "|---|---|---|---|---|"]
    for c in CANONICAL[4:-1]:
        s = p[c].dropna()
        if len(s):
            lines.append(f"| {c} | {UNITS.get(c, '')} | {s.min():.3f} | {s.mean():.3f} | {s.max():.3f} |")
    per_layer = p.groupby("layer").agg(rpm=("pump_rpm", "mean"), width=("sll_width", "mean"),
                                       height=("sll_height", "mean"), temp=("temperature", "mean"),
                                       power=("motor_power", "mean"), delay=("delay_setting_min", "max"))
    lines += ["\n## Per layer (printing rows)\n", per_layer.round(2).to_markdown()]
    lines += ["\n## Validation\n", *(f"- ⚠ {i}" for i in issues)] if issues else ["\n## Validation\n", "- OK"]
    return "\n".join(lines) + "\n"


def ingest(mapping_path: Path) -> Dataset:
    settings = get_settings()
    data_dir = settings.data_dir
    mapping = yaml.safe_load(mapping_path.read_text())
    name = mapping["dataset"]
    df = load_mapped(mapping, data_dir)
    issues = validate(df)
    (data_dir / "processed").mkdir(exist_ok=True)
    (data_dir / "reports").mkdir(exist_ok=True)
    processed = data_dir / "processed" / f"{name}.parquet"
    df.to_parquet(processed, index=False)
    (data_dir / "reports" / f"{name}.md").write_text(report(name, mapping, df, issues), encoding="utf-8")

    engine = create_engine(settings.sync_database_url)
    with Session(engine) as db:
        ds = db.scalar(select(Dataset).where(Dataset.name == name)) or Dataset(name=name)
        ds.title = mapping.get("title", name)
        ds.source_file = mapping["source_file"]
        ds.processed_file = str(processed.relative_to(data_dir))
        ds.mapping_file = str(mapping_path.name)
        ds.kind = mapping.get("kind", "stream")
        ds.row_count = len(df)
        ds.layer_count = int(df.layer.nunique())
        ds.first_layer = int(df.layer.min())
        ds.duration_s = int(df.t_s.max() - df.t_s.min() + 1)
        ds.synthetic = bool(mapping.get("synthetic", False))
        ds.imported_at = datetime.now(timezone.utc)
        ds.notes = "; ".join(issues) or None
        db.add(ds)
        db.commit()
        db.refresh(ds)
    engine.dispose()
    print(f"ingested {name}: {len(df)} rows, {ds.layer_count} layers, issues={len(issues)}")
    return ds


def main(argv: list[str]) -> None:
    if len(argv) >= 2 and argv[0] == "ingest":
        ingest(Path(argv[1]))
    elif argv and argv[0] == "ingest-all":
        for m in sorted((get_settings().data_dir / "mappings").glob("*.yaml")):
            ingest(m)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
