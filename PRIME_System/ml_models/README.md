# ml_models

The team's trained model files go here. The backend loads them with `joblib` from this folder.

| File | Model |
|---|---|
| `xgb_extrusion_model.pkl` | XGBoost: extrusion rate (RPM) |
| `xgb_extrusion_features.pkl` | XGBoost feature list |
| `xgb_extrusion_deployment_info.pkl` | XGBoost deployment info |
| `rf_delay_model.pkl` | Random Forest: interlayer delay class (1/5/10 min), about 125 MB |
| `rf_delay_features.pkl` | Random Forest feature list |
| `rf_delay_deployment_info.pkl` | Random Forest deployment info |

`rf_delay_model.pkl` is larger than GitHub's 100 MB file limit, so it can't be stored in this repo. Copy it from Box (`Milestone 2\PRIME_System\ml_models\`). Do not modify or retrain these files.
