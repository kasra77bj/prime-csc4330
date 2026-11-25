# 20 · Real Data & Models (supersedes numbers in 00, 05, 06, 11, 14, 15, 18)

Written after Phase 0 (Nov 20, 2026), once the team's pickles and lab data were inspected. **Where this file disagrees with an earlier spec, this file wins.** Evidence: `ml/MODEL_REPORT.md`, `data/reports/*.md`.

## 1. The models
| | Extrusion model | Interlayer-delay model |
|---|---|---|
| File (`ml_models/`) | `xgb_extrusion_model.pkl` (XGBRegressor, 5,552 trees) | `rf_delay_model.pkl` (RandomForestClassifier, 1,869 trees, 125 MB) |
| Output | Extrusion rate, **RPM** (regression) | Interlayer delay **class: 1, 5 or 10 (minutes)** |
| Inputs (same order for both) | `Flow`, `Motor Power`, `Temperature (C)` | same |
| Load | `joblib.load` (sklearn 1.8.0; xgboost 3.4.1 loads it with a version warning) | `joblib.load` (plain `pickle` fails) |

**Feature formulas (confirmed by Kasra):**
- `Flow = print_speed × SLL_Width × SLL_Height` (mm/s × mm × mm; ~3,000 at lab geometry). *The `deployment_info.pkl` mentions Total Height; that is outdated.*
- `Motor Power = Duty × Voltage × Current` (W; negative by duty sign convention, about −0.8 to −5.6 W).
- `Temperature (C)` = material temperature.

**How they behave at lab geometry (Flow ≈ 3,000):**
- XGBoost RPM follows **motor power** (−1 W → ~15 RPM, −2.5 W → ~27–36, −4.5 W → ~45–65).
- The RF class follows **temperature**: ≤ 18.5 °C → 1 min · ~19.5–20 °C → 10 min (|power| < ~3 W) · ~21.5–23 °C → 5 min. Confidence (max class probability) is 0.5–0.85.
- Both are step-like (trees); tiny input changes can jump the output. Demo data were therefore generated and **verified against these exact models**.

**Inference cadence:** one prediction per **vision checkpoint** (4 per layer, like the 4 rows per layer in `raw.xlsx`). Extrusion recommendation uses the mean of the last 2 checkpoint predictions; delay recommendation uses the layer's majority class.

## 2. Canonical signals & units (replaces the old list in 11 §2 and 00)
| Signal (DB column) | Unit | Lab range (raw.xlsx) | Demo range |
|---|---|---|---|
| `temperature` | °C | 15.9–16.7 | 19.7–22.4 |
| `pump_rpm` (extrusion rate) | RPM | 11–75 | 12–42 |
| `voltage` | V | 11.8–12.1 | 11.9–12.3 |
| `current` | A | 0.66–0.89 | 0.61–0.88 |
| `duty` | % (signed) | −0.56 to −0.10 | −0.44 to −0.08 |
| `motor_power` = duty×V×I | W | −5.6 to −0.8 | −3.5 to −0.8 (stored signed; **shown as the positive magnitude** 0.8–3.5 in readings, tiles, alerts, layers and reports; the models still get the signed value) |
| `print_speed` | mm/s | 10 | 10 |
| `sll_width` (vision) | mm | 18.2–20.2 | 16.7–19.7 |
| `sll_height` (vision) | mm | 14.3–16.0 | 15.0–16.0 |
| `total_height` | mm | 15.8–78.8 | up to ~125 |
| `flow` = speed×W×H | mm³/s | 2,600–3,200 | 2,600–3,200 |
| `delay_setting_min` | min | 5 | 5 → 10 |

Removed from earlier specs: `ambient_temp`, `pump_power` in kW, `layer_width/layer_height` names (now `sll_width/sll_height`), "°C 18–30 / RPM 180–320 / width 40 mm" mock values.

**Job geometry (seeded):** nozzle N2, mix PC42, speed 10 mm/s, target width **19.5 ± 1.0 mm** (critical ± 2.0), target height 15.7 ± 1.0 mm, path 960 mm/layer (96 s printing), default delay 5 min, 6–8 layers per job.

## 3. Datasets (in `data/generated/`, ingested to `data/processed/*.parquet`)
| Dataset | Purpose | Layers | Rows (1 Hz) |
|---|---|---|---|
| `demo_wp03` | **Main demo**: Wall Panel WP-03 on Gantry-02 (engineer accepts the AI change) | 8 | 2,868 (47.8 min real; ~4.8 min at 10×) |
| `demo_wp03_noaction` | Branch for layers 6–8 if nobody acts: RPM stays 27, width falls to ~16.7 mm (critical) | 3 | 888 |
| `trial_c12_calm` | **Trial dataset**: calm background print, Column C-12 on Arm-01 | 6 | 2,076 |
| `hist_wp02_completed` | Yesterday's completed print (Sessions/Report pages have content before the demo) | 8 | 3,168 |
| `lab_raw_reference` | The team's real lab rows (`raw_data/raw.xlsx`), kept as the range reference | 5 | 20 |

Each generated dataset has a `*_checkpoints.csv` (4 rows/layer with the model outputs at generation time, used as test fixtures) and a `*_stream.csv` (1 Hz rows: `printing` phase with checkpoint segments, then `interlayer_delay` phase). Regenerate with `make generate-data` (deterministic seeds). Between vision checkpoints the stream adds visible, seeded jitter: layer width ±0.45 mm, layer height ±0.55 mm, material temperature ±0.12 °C (the `checkpoint_mark` rows that feed the models are unchanged).

**Auto-pause (Nov 25):** any *critical* alert pauses a running print automatically (control event with no user, audit `session.auto_pause`, operator and engineer notified, red "Print paused automatically" banner on every print tab). Accepting or modifying an AI suggestion, or a manual adjustment, resumes it; rejecting leaves it paused (the operator can still press Resume or hold STOP). If the no-action branch was taken and the RPM change is accepted, the replay returns to the main (corrected) track at the next layer.

## 4. The demo story (replaces 14 §5 and the numbers in 18 §2)
| Layer | Temp °C | Pump RPM (applied) | Model RPM | Width at end (mm) | RF delay | What happens |
|---|---|---|---|---|---|---|
| 1–4 | 22.0→21.7 | 12 → 17 → 22 → 27 | agrees (±1) | ~19.5 | 5 (= setting) | calm, values rise with the wall |
| **5** | 21.6 | **27 (held)** | 31 → 33 → **34** | **18.05** (< 18.5) | 5 | width warning; **AI: "Increase pump speed 27 → 34 RPM"** |
| 6 | 21.5 | 34–36 after accept | 36 | 19.5 (recovers) | 5 | nudge "Applied at layer 6 · width recovering" |
| **7** | **19.8** (material cooled) | 39 | 39 | 19.6 | **10** (setting 5) | **AI: "Increase interlayer delay 5 → 10 min"** (confidence ~53 %) |
| 8 | 19.9 | 42 | 42 | 19.5 | 10 (= setting) | print completes → report |
| 6–8 (no action) | 21.5 → 19.7 | 27 | ~37 | 17.3 → 16.7 (critical < 17.5) | 5 → 10 | red alert → hold-to-stop demo |

Scenario file `data/scenarios/demo.yaml` (T1.3) only needs to: start the replay, switch to `demo_wp03_noaction` from layer 6 if no pump adjustment was made by the end of layer 5, compress the interlayer-delay phase (e.g., 5 min → 20 s at demo speed), and offer the `/demo` triggers. Values no longer need `set:` overrides because the datasets already carry the story; overrides remain available for rehearsal tweaks.

## 5. Updated recommendation rules (replaces 15 §6 numbers)
- **Pump RPM:** propose `round(mean(last 2 checkpoint predictions))` if it differs from current RPM by **≥ 4 RPM**; cap a single change at ±12 RPM; limits 5–80 RPM.
- **Interlayer delay:** propose the layer's majority RF class if it differs from `delay_setting_min` and max probability ≥ 0.5; applies after the current layer.
- `adjust_param` now includes **`interlayer_delay`** (in minutes); `print_speed` stays supported for manual changes.
- Confidence shown in UI: XGBoost → residual/training-range method (docs/15 §4); RF → max class probability.

## 6. Interlayer-delay semantics (assumption, confirm with Kasra)
Classes 1/5/10 are treated as **minutes** of waiting before the next layer starts (the lab sheet's `Delay = 5` matches the default setting). If they mean something else (seconds, or a category), only labels and the replay's delay phase length change.
