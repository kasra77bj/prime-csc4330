# 15 · ML Integration (XGBoost + Random Forest pickles)

> **Update (Nov 20, 2026):** real model inputs, units, value ranges and the demo story are now defined in [`20_data_and_models.md`](20_data_and_models.md). Where they differ, **doc 20 wins**.

| Model | Algorithm | Predicts | Used for |
|---|---|---|---|
| Extrusion model | **XGBoost** (`extrusion_xgb.pkl`) | Extrusion rate (expected: pump RPM needed for target bead width; **confirm in T0.4**) | Recommending pump RPM changes (US-09) |
| Interlayer model | **Random Forest** (`interlayer_rf.pkl`) | Interlayer delay (s) for the upcoming layer(s) | Predictive heads-up + recommending print-speed changes |

## 1. Pickle inspection (task T0.4, before anything else ML)
`ml/inspect_models.py` (run with the pinned versions) writes `ml/MODEL_REPORT.md`:
- Python object type (`xgboost.XGBRegressor`, `Booster`, `sklearn.ensemble.RandomForestRegressor`, or a `Pipeline` with scalers).
- **Feature names and order:** `model.feature_names_in_` (sklearn), `booster.feature_names` (xgboost); if absent, ask the team.
- Number of features, n_estimators, max_depth, objective.
- A smoke test: predict on 5 rows built from a processed dataset; print outputs and ranges.
- Library versions that loaded successfully; any `InconsistentVersionWarning`.
- SHAP TreeExplainer works? (yes/no)

**Security:** pickles execute code on load, so load only the team's own files; record `sha256` in `model_versions`.
**Version mismatch fallback:** if a pickle won't load, ask Kasra to re-export from the training environment: XGBoost `model.save_model("extrusion.json")` (version-independent) and RF via `joblib.dump` with matching sklearn. The adapter supports `.pkl`, `.joblib`, `.json`.

## 2. Model config (`ml/models/model_config.yaml`): filled after T0.4, confirmed by Kasra
```yaml
extrusion_rate:
  file: extrusion_xgb.pkl
  algorithm: xgboost
  output: { name: pump_rpm_required, unit: RPM }       # what the number means
  features:                                            # EXACT order the model expects
    - { name: material_temp,      from: layer_avg }
    - { name: ambient_temp,       from: layer_avg }
    - { name: print_speed,        from: layer_avg }
    - { name: target_width,       from: job.target_layer_width_mm }
    - { name: prev_layer_width,   from: lag, signal: layer_width, lag: 1 }
    - { name: width_slope_5,      from: slope, signal: layer_width, window_layers: 5 }
    - { name: elapsed_min,        from: session_elapsed_min }
  recommend:
    parameter: pump_rpm
    min_delta: 6            # don't bother below ±6 RPM
    max_step: 30            # cap a single recommendation
    limits_from: printer    # rpm_min / rpm_max
interlayer_delay:
  file: interlayer_rf.pkl
  algorithm: random_forest
  output: { name: interlayer_delay, unit: s }
  features:
    - { name: print_speed,        from: layer_avg }
    - { name: path_length_m,      from: job.path_length_per_layer_m }
    - { name: material_temp,      from: layer_avg }
    - { name: prev_delay,         from: lag, signal: interlayer_delay, lag: 1 }
  horizons: [1, 3, 6]       # predict 1, 3, 6 layers ahead by rolling features forward
  recommend:
    parameter: print_speed
    trigger: predicted > normal_max - 15 or predicted < normal_min + 10
```
*The feature list above is a placeholder; T0.4 replaces it with the real names/order. `features.py` implements a small library of feature builders (`layer_avg`, `lag`, `slope`, `rolling_mean`, `job.*`, `constant`) so changing features means editing YAML, not code.*

## 3. Inference pipeline (on every `layer_completed`)
```
features = FeatureBuilder(config).build(session, layers_so_far)        # 1 row, ordered
raw = adapter.predict(features)
value = scenario.override(target, layer) or raw                        # see 14 §5
interval, confidence = uncertainty(model, features)                     # §4
top_factors = explain(model, features)                                  # §5
save Prediction(... features snapshot, top_factors, source)
broadcast "prediction"
recommendation_engine.evaluate(prediction)                              # §6
alert_engine.check_predicted(prediction)                                # predicted_out_of_range
```
- Models are loaded once at startup into `ml/registry.py`; inference must take < 50 ms per layer.
- When the predicted layer closes, `observed_value` is back-filled for accuracy metrics.

## 4. Confidence / intervals (shown as "87 % confidence")
- **Random Forest:** spread of per-tree predictions (`estimators_`): interval = 10th–90th percentile; confidence = `1 − clamp(iqr / normal_range_width, 0, 0.6)`.
- **XGBoost:** no native interval → combine (a) distance of features from the training range (from `MODEL_REPORT` or the dataset stats; out-of-range features lower confidence) and (b) recent residuals (rolling MAE of the last 10 back-filled predictions). Formula documented in `ml/README.md`; clamp 0.5–0.97.
- Scenario overrides may pin confidence for the demo.

## 5. Explanations ("Why" bullets, US-09)
- SHAP `TreeExplainer` on the single feature row → top 2 features by |contribution|.
- Template sentences per feature (in `ml/explain_templates.yaml`), e.g.:
  - `width_slope_5` negative → "Layer width has dropped {pct}% over the last {n} layers while pump power is stable, which points to under-extrusion."
  - `material_temp` positive → "Material temperature is rising (+{delta} °C in 30 min), which increases viscosity."
- Fallback if SHAP fails: global `feature_importances_` × feature deviation from its recent mean.

## 6. Recommendation engine (`ml/recommend.py`)
**Extrusion (pump RPM):**
`proposed = clamp(round(prediction.value), rpm_min, rpm_max)`, limited to `current ± max_step`. Create a recommendation if `|proposed − current| ≥ min_delta` **and** (width is out of tolerance **or** width slope predicts leaving tolerance within 3 layers).
**Interlayer (print speed):** if the predicted delay at any horizon crosses the trigger, propose `speed_new = speed × predicted_delay / target_delay` (clamped to printer limits), and also raise a `predicted_out_of_range` warning (the "heads-up" nudge).
**Each recommendation includes:** title ("Increase pump speed 246 → 262 RPM"), 2 reason lines (§5), predicted effect series (re-run the model / response model of `14` §6 for 3 layers with and without the change → mini chart), risk text ("Low: within pump limits (max 320 RPM)"), confidence, `expires_at_layer = current + 4`.
**Lifecycle:** `pending` → `accepted` | `modified` | `rejected` | `expired` | `superseded`. Accepted/modified → `adjustments` row → runner applies at next layer → `adjustment` WS event → nudge "Applied at layer 43…".

## 7. Model metrics in the report (US-13)
Prediction accuracy for the session = `1 − MAPE` over back-filled predictions (per model), plus MAE in native units. Shown as "Extrusion 91 % (MAE 7 RPM) · Interlayer delay 93 % (MAE 6 s)". Ground truth: interlayer → measured delay of the predicted layer; extrusion → the RPM recorded in the dataset for that layer (confirm with Kasra in T0.4 whether a better ground truth exists). If Kasra has offline test metrics, store in `model_versions.metrics` and show on `/models`.
