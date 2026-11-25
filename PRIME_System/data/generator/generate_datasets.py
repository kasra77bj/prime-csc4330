"""Generate PRIME demo/trial datasets (deterministic).

Values are anchored to the team's lab data (raw_data/raw.xlsx: mix PC42, nozzle N2,
speed 10 mm/s, SLL width ~19.5 mm, SLL height ~15.7 mm, 12 V pump), but synthesized so
the team's pickled models produce a clean demo story.

Model inputs (confirmed by Kasra, Nov 20 2026):
    Flow           = speed x SLL_Width x SLL_Height
    Motor Power    = Duty x Voltage x Current
    Temperature (C)
Outputs: XGBoost -> Extrusion Rate (RPM); RandomForest -> Interlayer Delay class {1, 5, 10} (min)

What the models do around Flow ~3000 (see ml/MODEL_REPORT.md):
* XGBoost RPM is driven mostly by Motor Power (more negative power -> higher RPM).
* RandomForest delay class is driven mostly by Temperature:
  ~21.5-23 C -> 5 min, ~19.5-20 C -> 10 min (with |power| < ~3 W), <= 18.5 C -> 1 min.
Demo story therefore: warm material (~22 C) with a 5-min delay; a dip layer where the
operator holds RPM while XGBoost asks for more; then the material cools (~19.8 C) and the
RandomForest recommends lengthening the interlayer delay to 10 min.

Usage: python generate_datasets.py <models_dir> <out_dir>
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

SPEED_MM_S = 10.0
NOZZLE = "N2"
MIX = "PC42"
CHECKPOINTS = 4
PATH_LENGTH_MM = 960.0       # one lab-wall layer -> 96 s printing at 10 mm/s
LAYER_H = 15.7
VOLT_NOM = 12.0
POOL = 4000


@dataclass
class LayerSpec:
    layer: int
    kind: str                 # agree | dip | after_dip | branch
    temp: float               # material temperature (C), constant within a layer like raw.xlsx
    delay_class: int          # RF target (min)
    widths: list[float]       # planned SLL width per checkpoint
    rpm_nominal: float        # preferred model RPM center
    delay_setting: int = 5    # delay actually used after this layer (min)
    tol: float = 1.5


@dataclass
class DatasetSpec:
    name: str
    title: str
    seed: int
    layers: list[LayerSpec] = field(default_factory=list)
    held_rpm: int | None = None   # for branch datasets


def load_models(models_dir: Path):
    xgb = joblib.load(models_dir / "xgb_extrusion_model.pkl")
    rf = joblib.load(models_dir / "rf_delay_model.pkl")
    rf.n_jobs = -1
    return xgb, rf


def pool(ls: LayerSpec, temp: float, rng, xgb, rf):
    """Candidate rows for each checkpoint that satisfy the RF class target."""
    out = []
    for cp in range(CHECKPOINTS):
        width = ls.widths[cp] + rng.normal(0, 0.1, POOL)
        sll_h = LAYER_H + rng.normal(0, 0.2, POOL)
        power = -rng.uniform(0.3, 7.0, POOL)
        X = pd.DataFrame({"Flow": SPEED_MM_S * width * sll_h, "Motor Power": power,
                          "Temperature (C)": np.full(POOL, temp)})
        pred = xgb.predict(X)
        pr = rf.predict_proba(X)
        ok = (rf.classes_[pr.argmax(1)] == ls.delay_class) & (pr.max(1) >= 0.5)
        out.append(dict(width=width[ok], sll_h=sll_h[ok], power=power[ok], pred=pred[ok]))
    return out


def pick(cands, ls: LayerSpec, center: int):
    targets = [center - 4, center - 2, center, center] if ls.kind == "dip" else [center] * 4
    picks = []
    for cp, t in enumerate(targets):
        c = cands[cp]
        if c["pred"].size == 0:
            return None
        err = np.abs(c["pred"] - t)
        # stay close to target, to the planned width, and to the physical power ~ -0.074*RPM
        score = err / ls.tol + 2 * np.abs(c["width"] - ls.widths[cp]) \
            + 0.4 * np.abs(c["power"] - (-0.074 * t))
        score[err > ls.tol] = np.inf
        k = int(np.argmin(score))
        if not np.isfinite(score[k]):
            return None
        picks.append(k)
    return picks


def solve(ds: DatasetSpec, xgb, rf):
    rng = np.random.default_rng(ds.seed)
    chosen, prev_c = [], None
    for ls in ds.layers:
        if ls.kind == "agree":
            lo = (prev_c + 3) if prev_c is not None else 5
            centers = sorted(range(lo, 75), key=lambda c: abs(c - ls.rpm_nominal))
        elif ls.kind == "dip":
            centers = sorted(range(prev_c + 6, prev_c + 13), key=lambda c: abs(c - prev_c - 8))
        elif ls.kind == "after_dip":
            centers = sorted(range(prev_c - 3, prev_c + 4), key=lambda c: abs(c - prev_c - 1))
        else:  # branch: nobody acted, model keeps asking for more than the held RPM
            centers = sorted(range(ds.held_rpm + 6, ds.held_rpm + 16),
                             key=lambda c: abs(c - ds.held_rpm - 10))
        found = None
        for dt in (0.0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3):
            temp = round(ls.temp + dt, 2)
            cands = pool(ls, temp, rng, xgb, rf)
            for c in centers[:20]:
                p = pick(cands, ls, c)
                if p:
                    found = (temp, c, p, cands)
                    break
            if found:
                break
        if not found:
            raise RuntimeError(f"{ds.name}: layer {ls.layer} infeasible")
        chosen.append(found)
        prev_c = found[1]
        print(f"  {ds.name} L{ls.layer} {ls.kind:9s} T={found[0]} model_rpm~{found[1]}", flush=True)
    return chosen


def build(ds: DatasetSpec, xgb, rf):
    chosen = solve(ds, xgb, rf)
    rng = np.random.default_rng(ds.seed + 1000)
    rows, prev_c = [], None
    for ls, (temp, c, picks, cands) in zip(ds.layers, chosen):
        rpm = {"agree": c, "after_dip": c, "dip": prev_c, "branch": ds.held_rpm}[ls.kind]
        prev_c = c
        for cp in range(CHECKPOINTS):
            k, cd = picks[cp], cands[cp]
            volt = round(VOLT_NOM + rng.normal(0, 0.08), 3)
            current = round(float(np.clip(rng.normal(0.78, 0.07), 0.62, 0.92)), 3)
            duty = round(float(cd["power"][k]) / (volt * current), 4)
            rows.append(dict(layer=ls.layer, checkpoint=cp + 1, rpm=int(rpm),
                             sll_width_mm=round(float(cd["width"][k]), 3),
                             sll_height_mm=round(float(cd["sll_h"][k]), 3),
                             voltage_v=volt, current_a=current, duty_pct=duty,
                             temperature_c=temp, delay_setting_min=ls.delay_setting))
    cp = pd.DataFrame(rows)
    lh = cp.groupby("layer").sll_height_mm.mean()
    base = (ds.layers[0].layer - 1) * LAYER_H
    cp["total_height_mm"] = cp.layer.map(base + lh.cumsum()).round(3)
    cp["motor_power_w"] = (cp.duty_pct * cp.voltage_v * cp.current_a).round(4)
    cp["flow"] = (SPEED_MM_S * cp.sll_width_mm * cp.sll_height_mm).round(3)
    X = pd.DataFrame({"Flow": cp.flow, "Motor Power": cp.motor_power_w,
                      "Temperature (C)": cp.temperature_c})
    cp["xgb_pred_rpm"] = np.round(xgb.predict(X), 2)
    pr = rf.predict_proba(X)
    cp["rf_pred_delay_min"] = rf.classes_[pr.argmax(1)]
    cp["rf_confidence"] = pr.max(1).round(3)

    stream, t = [], 0
    print_s = int(PATH_LENGTH_MM / SPEED_MM_S)
    last_layer = ds.layers[-1].layer
    for ls in ds.layers:
        lr = cp[cp.layer == ls.layer].reset_index(drop=True)
        for s in range(print_s):
            idx = min(int(s / print_s * CHECKPOINTS), CHECKPOINTS - 1)
            r = lr.loc[idx]
            # The vision checkpoint is measured at the END of its segment: that row carries the exact
            # checkpoint values (model inputs); the rows in between get small sensor noise for realism.
            at_mark = s + 1 == print_s or min(int((s + 1) / print_s * CHECKPOINTS), CHECKPOINTS - 1) != idx
            n = 0.0 if at_mark else 1.0
            # visible bead variation between marks: width/height wider, temperature small (docs/20 section 3)
            dw = float(np.clip(rng.normal(0, 0.22), -0.45, 0.45))
            dh = float(np.clip(rng.normal(0, 0.25), -0.55, 0.55))
            dt = float(np.clip(rng.normal(0, 0.05), -0.12, 0.12))
            stream.append(dict(t_s=t, layer=ls.layer, phase="printing", checkpoint=int(r.checkpoint),
                               speed_mm_s=SPEED_MM_S, nozzle=NOZZLE, mixture=MIX, rpm=int(r.rpm),
                               sll_width_mm=round(r.sll_width_mm + n * dw, 3),
                               sll_height_mm=round(r.sll_height_mm + n * dh, 3),
                               total_height_mm=r.total_height_mm,
                               voltage_v=round(r.voltage_v + n * rng.normal(0, 0.01), 3),
                               current_a=round(r.current_a + n * rng.normal(0, 0.006), 3),
                               duty_pct=round(r.duty_pct * (1 + n * rng.normal(0, 0.008)), 4),
                               temperature_c=round(r.temperature_c + n * dt, 3),
                               checkpoint_mark=bool(at_mark), delay_setting_min=ls.delay_setting))
            t += 1
        if ls.layer != last_layer:
            last = lr.iloc[-1]
            for _ in range(ls.delay_setting * 60):
                stream.append(dict(t_s=t, layer=ls.layer, phase="interlayer_delay", checkpoint=None,
                                   speed_mm_s=0.0, nozzle=NOZZLE, mixture=MIX, rpm=0,
                                   sll_width_mm=last.sll_width_mm, sll_height_mm=last.sll_height_mm,
                                   total_height_mm=last.total_height_mm,
                                   voltage_v=round(VOLT_NOM + rng.normal(0, 0.02), 3),
                                   current_a=0.0, duty_pct=0.0,
                                   temperature_c=round(last.temperature_c + rng.normal(0, 0.015), 3),
                                   delay_setting_min=ls.delay_setting))
                t += 1
    st = pd.DataFrame(stream)
    st["motor_power_w"] = (st.duty_pct * st.voltage_v * st.current_a).round(4)
    st["flow"] = (st.speed_mm_s * st.sll_width_mm * st.sll_height_mm).round(3)
    return cp, st


def W(base, d=(0.05, -0.08, 0.1, -0.04)):
    return [round(base + x, 2) for x in d]


def specs():
    demo = DatasetSpec("demo_wp03", "Wall Panel WP-03: live demo (engineer accepts the AI change)",
                       seed=42, layers=[
        LayerSpec(1, "agree", 22.0, 5, W(19.6), 12),
        LayerSpec(2, "agree", 21.9, 5, W(19.55), 17),
        LayerSpec(3, "agree", 21.8, 5, W(19.6), 22),
        LayerSpec(4, "agree", 21.7, 5, W(19.5), 27),
        LayerSpec(5, "dip", 21.6, 5, [19.2, 18.8, 18.35, 18.05], 34),
        LayerSpec(6, "after_dip", 21.5, 5, [18.7, 19.1, 19.4, 19.55], 35),
        LayerSpec(7, "agree", 19.8, 10, W(19.55), 38),
        LayerSpec(8, "agree", 19.7, 10, W(19.5), 41, delay_setting=10),
    ])
    calm = DatasetSpec("trial_c12_calm", "Column C-12: calm background print (Arm-01)", seed=7,
                       layers=[LayerSpec(i, "agree", t, 5, W(19.5), rpm)
                               for i, (rpm, t) in enumerate([(12, 22.4), (16, 22.3), (21, 22.2),
                                                             (26, 22.1), (30, 22.0), (34, 21.9)], 1)])
    hist = DatasetSpec("hist_wp02_completed", "Wall Panel WP-02: yesterday's completed print",
                       seed=11, layers=[
        LayerSpec(1, "agree", 22.2, 5, W(19.5), 12),
        LayerSpec(2, "agree", 22.1, 5, W(19.5), 17),
        LayerSpec(3, "dip", 22.0, 5, [19.1, 18.7, 18.4, 18.3], 24),
        LayerSpec(4, "after_dip", 21.9, 5, [18.9, 19.3, 19.5, 19.5], 25),
        LayerSpec(5, "agree", 21.8, 5, W(19.5), 29),
        LayerSpec(6, "agree", 21.7, 5, W(19.5), 33),
        LayerSpec(7, "agree", 19.8, 10, W(19.5), 37, delay_setting=10),
        LayerSpec(8, "agree", 19.7, 10, W(19.5), 40, delay_setting=10),
    ])
    return [demo, calm, hist]


def main(models_dir, out_dir):
    xgb, rf = load_models(Path(models_dir))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    summary, built = {}, {}
    for ds in specs():
        cp, st = build(ds, xgb, rf)
        built[ds.name] = cp
        cp.to_csv(out / f"{ds.name}_checkpoints.csv", index=False)
        st.to_csv(out / f"{ds.name}_stream.csv", index=False)
        summary[ds.name] = dict(title=ds.title, layers=int(cp.layer.nunique()),
                                stream_rows=len(st), duration_min=round(len(st) / 60, 1))
    d = built["demo_wp03"]
    held = int(d[d.layer == 5].rpm.iloc[0])
    t6 = float(d[d.layer == 6].temperature_c.iloc[0])
    branch = DatasetSpec("demo_wp03_noaction",
                         "WP-03 branch for layers 6-8: nobody acts on the AI recommendation",
                         seed=43, held_rpm=held, layers=[
        LayerSpec(6, "branch", t6, 5, [17.9, 17.7, 17.45, 17.3], held + 10, tol=2.0),
        LayerSpec(7, "branch", 19.8, 10, [17.2, 17.1, 17.0, 16.9], held + 10, tol=2.0),
        LayerSpec(8, "branch", 19.7, 10, [16.9, 16.8, 16.8, 16.7], held + 10, tol=2.0,
                  delay_setting=10),
    ])
    cp, st = build(branch, xgb, rf)
    cp.to_csv(out / f"{branch.name}_checkpoints.csv", index=False)
    st.to_csv(out / f"{branch.name}_stream.csv", index=False)
    summary[branch.name] = dict(title=branch.title, layers=3, stream_rows=len(st), held_rpm=held)
    (out / "datasets_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
