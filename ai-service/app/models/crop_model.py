"""
Scikit-learn Crop Recommendation Model.

Production path:
  1. Train a RandomForestClassifier / GradientBoostingClassifier on a
     crop-recommendation dataset (e.g. Kaggle "Crop Recommendation Dataset").
  2. Serialize with joblib: joblib.dump(model, MODEL_DIR / "crop_model.pkl")
  3. Update _load_model() if necessary.

The wrapper ships a rule-based heuristic fallback for development.
"""

import os
import logging
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(os.getenv("MODEL_DIR", "./models"))

# ── Crop metadata ─────────────────────────────────────────────────────────────
# name → (emoji, label list for classifier)
CROP_META: dict[str, dict] = {
    "Wheat":        {"emoji": "🌾", "label": 0},
    "Rice":         {"emoji": "🌾", "label": 1},
    "Maize":        {"emoji": "🌽", "label": 2},
    "Cotton":       {"emoji": "🌿", "label": 3},
    "Mustard":      {"emoji": "🌻", "label": 4},
    "Gram (Chana)": {"emoji": "🫘", "label": 5},
    "Sugarcane":    {"emoji": "🎋", "label": 6},
    "Soybean":      {"emoji": "🫘", "label": 7},
    "Groundnut":    {"emoji": "🥜", "label": 8},
    "Barley":       {"emoji": "🌾", "label": 9},
    "Sunflower":    {"emoji": "🌻", "label": 10},
    "Spinach":      {"emoji": "🥬", "label": 11},
    "Carrot":       {"emoji": "🥕", "label": 12},
    "Methi":        {"emoji": "🌿", "label": 13},
}

# Reverse map: label → name
LABEL_TO_CROP = {v["label"]: k for k, v in CROP_META.items()}


class CropModel:
    """
    Wrapper around a Scikit-learn crop recommendation model.
    Falls back to a rule-based heuristic when no model file is found.
    """

    def __init__(self) -> None:
        self._model: Any = None
        self._load_model()

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load_model(self) -> None:
        model_path = MODEL_DIR / "crop_model.pkl"
        if model_path.exists():
            try:
                import joblib  # type: ignore
                self._model = joblib.load(str(model_path))
                logger.info("Loaded Scikit-learn crop model from %s", model_path)
            except Exception as exc:
                logger.warning("Failed to load crop model: %s", exc)
                self._model = None
        else:
            logger.warning(
                "No crop model found at %s — using rule-based fallback.", model_path
            )

    # ── Feature encoding ──────────────────────────────────────────────────────

    @staticmethod
    def _encode(params: dict) -> np.ndarray:
        """
        Encode request parameters into a feature vector.
        Feature order: [nitrogen, ph, rainfall, temperature]
        (matches the Kaggle Crop Recommendation Dataset schema)
        """
        nitrogen    = float(params.get("nitrogen", 50))
        ph          = float(params.get("ph", 6.5))
        rainfall    = float(params.get("rainfall", 800))
        temperature = float(params.get("temp", 25))
        return np.array([[nitrogen, ph, rainfall, temperature]], dtype=np.float32)

    # ── Inference ─────────────────────────────────────────────────────────────

    def recommend(self, params: dict) -> list[dict]:
        """
        Returns a ranked list of up to 6 crop recommendations.
        Each item: { emoji, name, score, why }
        """
        if self._model is not None:
            return self._recommend_ml(params)
        return self._recommend_heuristic(params)

    def _recommend_ml(self, params: dict) -> list[dict]:
        features = self._encode(params)
        # predict_proba gives probability for each class
        proba = self._model.predict_proba(features)[0]
        classes = self._model.classes_

        scored = sorted(
            zip(classes, proba), key=lambda x: x[1], reverse=True
        )[:6]

        results = []
        for label, prob in scored:
            crop_name = LABEL_TO_CROP.get(int(label), str(label))
            meta = CROP_META.get(crop_name, {"emoji": "🌱"})
            results.append({
                "emoji": meta["emoji"],
                "name": crop_name,
                "score": round(float(prob) * 100, 1),
                "why": _why_text(crop_name, params),
            })
        return results

    def _recommend_heuristic(self, params: dict) -> list[dict]:
        """
        Simple rule-based recommendations based on season, soil, pH, and rainfall.
        """
        season   = (params.get("season") or "rabi").lower()
        soil     = (params.get("soil")   or "loamy").lower()
        ph       = float(params.get("ph") or 6.5)
        rainfall = float(params.get("rainfall") or 800)
        temp     = float(params.get("temp") or 25)
        nitrogen = float(params.get("nitrogen") or 50)

        candidates: list[tuple[str, float]] = []

        # ── Rabi (Oct–Mar, cool season) ──────────────────────────────────────
        if season in ("rabi", "winter"):
            candidates += [
                ("Wheat",        _score(ph, 6.0, 7.5) + _score(temp, 15, 25) + 20),
                ("Mustard",      _score(ph, 6.0, 7.5) + _score(temp, 15, 22) + 15),
                ("Gram (Chana)", _score(ph, 6.0, 8.0) + _score(temp, 15, 25) + 10),
                ("Barley",       _score(ph, 6.0, 8.0) + _score(temp, 12, 22) + 8),
                ("Spinach",      _score(ph, 6.0, 7.0) + _score(temp, 10, 20) + 5),
                ("Carrot",       _score(ph, 5.5, 7.0) + _score(temp, 15, 20) + 5),
                ("Methi",        _score(ph, 6.0, 7.5) + _score(temp, 15, 25) + 3),
            ]

        # ── Kharif (Jun–Sep, monsoon season) ─────────────────────────────────
        elif season in ("kharif", "monsoon"):
            candidates += [
                ("Rice",      _score(ph, 5.5, 7.0) + _score(rainfall, 1000, 2000) + 20),
                ("Maize",     _score(ph, 5.5, 7.5) + _score(temp, 21, 30) + 15),
                ("Cotton",    _score(ph, 6.0, 8.5) + _score(temp, 25, 35) + 12),
                ("Soybean",   _score(ph, 6.0, 7.5) + _score(temp, 20, 30) + 10),
                ("Groundnut", _score(ph, 5.5, 7.0) + _score(temp, 25, 35) + 8),
                ("Sugarcane", _score(ph, 6.0, 7.5) + _score(temp, 25, 35) + 7),
                ("Sunflower", _score(ph, 6.0, 8.0) + _score(temp, 20, 35) + 5),
            ]

        # ── Zaid / Summer ─────────────────────────────────────────────────────
        else:
            candidates += [
                ("Maize",     _score(temp, 25, 35) + 20),
                ("Groundnut", _score(temp, 25, 35) + 15),
                ("Sunflower", _score(temp, 25, 35) + 10),
                ("Sugarcane", _score(temp, 25, 35) + 8),
                ("Spinach",   _score(temp, 18, 28) + 5),
                ("Methi",     _score(temp, 20, 30) + 3),
            ]

        # Soil bonus
        for i, (name, sc) in enumerate(candidates):
            bonus = 0
            if "loamy" in soil: bonus += 10
            if "clay"  in soil and name in ("Rice", "Wheat"): bonus += 8
            if "sandy" in soil and name in ("Groundnut", "Carrot", "Methi"): bonus += 8
            if "black" in soil and name in ("Cotton", "Soybean"): bonus += 10
            # Nitrogen bonus for high-N-demand crops
            if nitrogen > 60 and name in ("Wheat", "Maize", "Rice"): bonus += 5
            candidates[i] = (name, sc + bonus)

        candidates.sort(key=lambda x: x[1], reverse=True)
        top6 = candidates[:6]

        # Normalise scores to 0–99
        max_sc = max(sc for _, sc in top6) if top6 else 1
        results = []
        for name, sc in top6:
            meta = CROP_META.get(name, {"emoji": "🌱"})
            results.append({
                "emoji": meta["emoji"],
                "name": name,
                "score": min(99, round(sc / max_sc * 95)),
                "why": _why_text(name, params),
            })
        return results


# ── Helpers ───────────────────────────────────────────────────────────────────

def _score(value: float, low: float, high: float) -> float:
    """Returns 0–30 based on how well `value` falls in [low, high]."""
    if low <= value <= high:
        mid = (low + high) / 2
        return 30 - abs(value - mid) / ((high - low) / 2) * 10
    return max(0, 15 - abs(value - (low if value < low else high)) * 2)


def _why_text(crop: str, params: dict) -> str:
    """Returns a short human-readable reason for the recommendation."""
    soil   = params.get("soil", "loamy")
    season = params.get("season", "rabi")
    region = params.get("region", "Punjab")

    reasons: dict[str, str] = {
        "Wheat":        f"Best soil + season match for {region}",
        "Rice":         "High rainfall suits paddy cultivation",
        "Mustard":      "High yield, moderate water requirement",
        "Gram (Chana)": "Nitrogen-fixing legume, improves soil",
        "Maize":        "Short cycle, high yield in warm weather",
        "Cotton":       f"Ideal for {soil} soil in warm climate",
        "Soybean":      f"Protein-rich, good {season} cash crop",
        "Groundnut":    "Drought-tolerant oilseed crop",
        "Sugarcane":    "High value; suits irrigated farms",
        "Barley":       "Tolerates cooler temps, low water need",
        "Sunflower":    "Good oil content, wide adaptability",
        "Spinach":      "Short 45-day cycle, high market demand",
        "Carrot":       "Good winter demand, sandy/loamy soil",
        "Methi":        "Low water, medicinal & culinary value",
    }
    return reasons.get(crop, "Good match for current conditions")
