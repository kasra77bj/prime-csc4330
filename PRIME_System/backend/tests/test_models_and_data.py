"""ML smoke tests: pickles load, feature order, and the generated demo data tells the intended story."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "ml_models"
GEN = ROOT / "data" / "generated"
pytestmark = pytest.mark.skipif(not (MODELS / "rf_delay_model.pkl").exists(), reason="pickles not present")


@pytest.fixture(scope="module")
def models():
    return joblib.load(MODELS / "xgb_extrusion_model.pkl"), joblib.load(MODELS / "rf_delay_model.pkl")


def features(cp: pd.DataFrame) -> pd.DataFrame:
    cfg = yaml.safe_load((ROOT / "ml" / "model_config.yaml").read_text())
    names = [f["name"] for f in cfg["features"]]
    X = pd.DataFrame({
        "Flow": 10.0 * cp.sll_width_mm * cp.sll_height_mm,          # speed x SLL_Width x SLL_Height
        "Motor Power": cp.duty_pct * cp.voltage_v * cp.current_a,    # Duty x Voltage x Current
        "Temperature (C)": cp.temperature_c,
    })
    return X[names]


def test_feature_order_matches_pickles(models):
    xgb, rf = models
    assert list(rf.feature_names_in_) == ["Flow", "Motor Power", "Temperature (C)"]
    assert xgb.get_booster().feature_names == ["Flow", "Motor Power", "Temperature (C)"]
    assert list(rf.classes_) == [1, 5, 10]


def test_generated_checkpoints_reproduce_with_models(models):
    xgb, rf = models
    cp = pd.read_csv(GEN / "demo_wp03_checkpoints.csv")
    X = features(cp)
    assert np.allclose(xgb.predict(X), cp.xgb_pred_rpm, atol=0.02)
    assert (rf.classes_[rf.predict_proba(X).argmax(1)] == cp.rf_pred_delay_min).all()


def test_demo_story(models):
    cp = pd.read_csv(GEN / "demo_wp03_checkpoints.csv")
    by = cp.groupby("layer").agg(rpm=("rpm", "first"), model=("xgb_pred_rpm", "mean"),
                                 last_model=("xgb_pred_rpm", "last"), delay=("rf_pred_delay_min", "max"),
                                 setting=("delay_setting_min", "first"), width=("sll_width_mm", "last"))
    normal = by.loc[[1, 2, 3, 4, 7, 8]]
    assert (abs(normal.model - normal.rpm) < 4).all(), "model agrees with operator on normal layers"
    assert by.loc[5, "last_model"] - by.loc[5, "rpm"] >= 6, "dip layer: model asks for >= +6 RPM"
    assert by.loc[5, "width"] < 18.5, "dip layer ends below width tolerance (19.5 +/- 1.0)"
    assert (by.loc[[1, 2, 3, 4, 5, 6], "delay"] == 5).all()
    assert by.loc[7, "delay"] == 10 and by.loc[7, "setting"] == 5, "RF recommends 5 -> 10 min at layer 7"
