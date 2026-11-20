# 14 · Data Ingest, Replay Engine & Demo Scenario

> **Update (Nov 20, 2026):** real model inputs, units, value ranges and the demo story are now defined in [`20_data_and_models.md`](20_data_and_models.md). Where they differ, **doc 20 wins**.

The demo replays **real sensor logs from previous prints** as if they were live. A scenario file layers deterministic, hardcoded moments on top so the demo story happens on cue every rehearsal.

## 1. Data contract (canonical columns)
| Canonical column | Unit | Required | Notes |
|---|---|---|---|
| `t` | seconds from print start (or ISO timestamp) | ✓ | converted to seconds |
| `layer` | int | ✓* | *if missing, derived from `layer_height` jumps or z-position, or from a layer-start event column |
| `material_temp` | °C | ✓ | |
| `ambient_temp` | °C | | |
| `pump_rpm` | RPM | ✓ | the model's extrusion input/target |
| `pump_power` | kW | | |
| `print_speed` | mm/s | ✓ | |
| `layer_width` | mm | ✓ | from vision; can be per-layer only (forward-filled) |
| `layer_height` | mm | | |
| `interlayer_delay` | s | ✓* | *if missing, computed as time between consecutive layer starts at the same path position |

## 2. Mapping files (`data/mappings/<dataset>.yaml`)
Kasra's CSVs keep their original names; a mapping adapts them.
```yaml
dataset: wp03_2026_09_14
source_file: raw/print_0914.csv
time: { column: "Time(s)", kind: seconds }      # or { column: "timestamp", kind: iso, tz: America/Chicago }
columns:
  layer: "Layer#"
  material_temp: "T_mat [C]"
  ambient_temp: "T_amb"
  pump_rpm: "Pump_RPM"
  pump_power: { column: "Pump_W", scale: 0.001 }   # W → kW
  print_speed: "Speed_mm_s"
  layer_width: "W_mm"
  layer_height: "H_mm"
  interlayer_delay: null                          # → derive
resample_hz: 1                                    # target tick rate
clean:
  drop_rows_where: { pump_rpm: "<= 0" }           # idle/priming rows
  clip: { layer_width: [10, 80] }
  interpolate_gaps_up_to_s: 5
frames_dir: frames/wp03_2026_09_14                # optional: layer_###.jpg
```

## 3. Ingest pipeline (`make ingest` → `python -m app.replay.source_csv ingest <mapping>`)
1. Load CSV with pandas, apply mapping, units, cleaning, resample to 1 Hz.
2. Derive `layer` / `interlayer_delay` if missing.
3. Validate: monotonic time, layers increasing, value ranges plausible; write a short **data report** (`data/reports/<dataset>.md`: rows, layers, duration, per-signal min/max/mean, gaps) for the team to sanity-check.
4. Save as `data/processed/<dataset>.parquet` (fast replay) and create a `datasets` row.

> **T0.3 deliverable:** once Kasra drops CSVs into `data/raw/`, an agent drafts each mapping by reading headers + first 50 rows, then asks the team to confirm any ambiguous column.

## 4. Replay engine (`app/replay/runner.py`)
One `SessionRunner` (asyncio task) per active session:
```
state: cursor, sim_time, layer, status, current_rpm, current_speed, pending_adjustments, speed_multiplier
loop every (1 / speed_multiplier) seconds while status == running:
    row = dataset[cursor]                      # recorded values
    row = apply_adjustment_response(row)        # §6 physics, so accepted changes visibly matter
    row = apply_scenario(row, layer, sim_time) # §5 overrides / injected events
    persist reading (batched every 1 s) → broadcast → alert_engine.check(row)
    if row.layer > state.layer: close_layer() → ml.predict() → recommend()
    cursor += 1; at end → status = completed → generate report
pause: loop idles, cursor kept · resume: continue · stop: status = stopped, report generated
```
- Deterministic: same dataset + scenario + seed ⇒ identical demo every time (`numpy` RNG seeded for any noise).
- Survives backend restart: runner state is persisted on `print_sessions` (`replay_cursor`, `current_rpm`, …) and resumed on startup (reliability NFR).
- Background printers (Arm-01) replay a calm dataset at the same speed so the dashboard looks alive.

## 5. Demo scenario + hardcoded overrides (`data/scenarios/demo.yaml`)
The user asked that some values be hardcoded so the demo works perfectly. Scenario rules apply **on top of** the recorded data, and every overridden value is stored with `source = scenario_override` (provenance stays in the DB; the UI doesn't show it).
```yaml
scenario: demo
dataset: wp03_2026_09_14
start_layer: 36            # start the demo near the action
speed: 8                   # 8× real time
seed: 42
events:
  - name: width_dip                       # the core story
    layers: [39, 43]
    set:
      layer_width: { ramp_from: 40.2, ramp_to: 36.4 }   # −9 %, triggers warning at layer 41
      material_temp: { add_ramp: [0, 1.8] }            # stiffening material, explains the "why"
  - name: pin_extrusion_prediction
    at_layer: 41
    prediction:
      extrusion_rate: { value: 262, confidence: 0.87 }   # guarantees the 246 → 262 RPM recommendation
  - name: interlayer_heads_up
    at_layer: 44
    prediction:
      interlayer_delay: { value: 228, horizon_layers: 6, confidence: 0.81 }  # predictive nudge
  - name: recovery                        # only if the recommendation is accepted/modified
    after_adjustment: pump_rpm
    over_layers: 3
    set: { layer_width: { ramp_to: 39.6 } }
  - name: no_action_fallback              # if the engineer rejects or nobody acts in 4 layers
    if_no_adjustment_by_layer: 45
    set: { layer_width: { ramp_to: 35.2 } }                  # crosses critical → red alert → Stop demo
optional_triggers:         # fired from /demo panel only
  sensor_drop: { signal: material_temp, seconds: 8 }        # shows "Reconnecting/buffered"
  temp_spike:  { signal: material_temp, value: 31.2, seconds: 20 }
```
**Override semantics:** `set` replaces the value; `add_ramp` adds a linearly growing offset; `ramp_from/ramp_to` interpolate across the layer range; `prediction` replaces the model output for that layer (the model still runs, and its raw output is kept in `features.raw_model_output` for honesty/debugging).

## 6. Adjustment response (makes decisions visibly matter)
Recorded data was captured at the original settings, so after an adjustment we transform later rows with simple, defensible relationships:
- **Pump RPM change** (extrusion rate ∝ RPM): `layer_width' = layer_width × (rpm_new / rpm_recorded)^α`, α = 0.8 (configurable); `pump_power' = pump_power × (rpm_new / rpm_recorded)`.
- **Print speed change**: `layer_width' = layer_width × (speed_recorded / speed_new)^β`, β = 0.5; `interlayer_delay' = interlayer_delay × (speed_recorded / speed_new)` (delay = path length ÷ speed).
- Changes take effect at the **next layer start**, ramped over 1 layer (matches UI copy "applies at next layer").
- Scenario `recovery` rules, if present, take precedence so the visual outcome is exactly what was rehearsed.

## 7. Camera frames (Vision, US-05)
- If Kasra provides frames: `frames/<dataset>/layer_###.jpg` → served by `/layers/{n}/frame`; overlay values come from the layer's measured width/height.
- If not: 6–8 representative bead images are reused cyclically; overlay calipers drawn by the front end from the numbers (the overlay is SVG, so it stays crisp).
