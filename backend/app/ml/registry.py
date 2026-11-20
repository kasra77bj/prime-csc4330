"""Loads the team's pickles once and runs inference + explanations (docs/15, docs/20; task T2.1/T2.2).

Inputs (order from ml/model_config.yaml): Flow = speed x SLL_Width x SLL_Height,
Motor Power = Duty x Voltage x Current, Temperature (C).
"""
from __future__ import annotations

import hashlib
import logging
import threading
import warnings
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import yaml

from app.config import get_settings

log = logging.getLogger("prime.ml")


@dataclass
class ExtrusionResult:
    rpm: float
    contributions: dict[str, float]   # SHAP contribution per feature (RPM units)
    base_value: float


@dataclass
class DelayResult:
    minutes: int
    probabilities: dict[str, float]
    contributions: dict[str, float]   # SHAP for the predicted class (probability units)


class ModelRegistry:
    def __init__(self) -> None:
        s = get_settings()
        self.config = yaml.safe_load(Path(s.model_config_path).read_text())
        self.features: list[str] = [f["name"] for f in self.config["features"]]
        self._lock = threading.Lock()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            self.xgb = self._load(s.model_dir, self.config["extrusion_rate"]["file"])
            self.rf = self._load(s.model_dir, self.config["interlayer_delay"]["file"])
        self.rf.n_jobs = 1                      # single-row inference is faster without the thread pool
        self.classes = [int(c) for c in self.rf.classes_]
        self.train_range = self.config["extrusion_rate"]["confidence"]["training_range"]
        self._xgb_explainer = None
        self._rf_explainer = None
        self.sha256 = {k: self._sha(s.model_dir / self.config[k]["file"]) for k in ("extrusion_rate", "interlayer_delay")}

    @staticmethod
    def _load(model_dir: Path, name: str):
        p = Path(model_dir) / name
        if p.suffix == ".json":                 # Booster.save_model export (version independent)
            import xgboost
            m = xgboost.XGBRegressor()
            m.load_model(p)
            return m
        return joblib.load(p)

    @staticmethod
    def _sha(p: Path) -> str:
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()

    def frame(self, flow: float, motor_power: float, temperature: float) -> pd.DataFrame:
        vals = {"Flow": flow, "Motor Power": motor_power, "Temperature (C)": temperature}
        return pd.DataFrame([[vals[f] for f in self.features]], columns=self.features)

    def _explainers(self):
        if self._xgb_explainer is None:
            import shap
            self._xgb_explainer = shap.TreeExplainer(self.xgb)
            self._rf_explainer = shap.TreeExplainer(self.rf)
        return self._xgb_explainer, self._rf_explainer

    def predict(self, flow: float, motor_power: float, temperature: float,
                explain: bool = True) -> tuple[ExtrusionResult, DelayResult]:
        X = self.frame(flow, motor_power, temperature)
        with self._lock:                        # models are not guaranteed thread-safe
            rpm = float(self.xgb.predict(X)[0])
            proba = self.rf.predict_proba(X)[0]
            k = int(np.argmax(proba))
            xc, rc, base = {}, {}, 0.0
            if explain:
                try:
                    ex, er = self._explainers()
                    sv = np.asarray(ex.shap_values(X))[0]
                    xc = {f: float(v) for f, v in zip(self.features, sv)}
                    base = float(np.ravel(ex.expected_value)[0])
                    rsv = np.asarray(er.shap_values(X))       # (1, n_features, n_classes)
                    rc = {f: float(rsv[0, i, k]) for i, f in enumerate(self.features)}
                except Exception:                              # explanation must never break inference
                    log.exception("SHAP failed; falling back to feature importances")
                    xc = {f: float(w) for f, w in zip(self.features, self.xgb.feature_importances_)}
                    rc = {f: float(w) for f, w in zip(self.features, self.rf.feature_importances_)}
        return (ExtrusionResult(rpm, xc, base),
                DelayResult(self.classes[k], {str(c): float(p) for c, p in zip(self.classes, proba)}, rc))

    def out_of_training_range(self, values: dict[str, float]) -> list[str]:
        out = []
        for f, (lo, hi) in self.train_range.items():
            v = values.get(f)
            if v is not None and not (lo <= v <= hi):
                out.append(f)
        return out


_registry: ModelRegistry | None = None
_registry_lock = threading.Lock()


def get_registry() -> ModelRegistry:
    global _registry
    with _registry_lock:
        if _registry is None:
            _registry = ModelRegistry()
            log.info("ML models loaded: features=%s classes=%s", _registry.features, _registry.classes)
    return _registry
