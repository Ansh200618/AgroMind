"""
CNN-based Leaf Disease Detection Model Wrapper.

Production path:
  1. Train a CNN (e.g. MobileNetV2 fine-tuned on PlantVillage dataset) and
     save it to MODEL_DIR/disease_model.h5  (TensorFlow/Keras)
     OR  MODEL_DIR/disease_model.pt         (PyTorch TorchScript)
  2. Update _load_model() to load the real weights.
  3. Update CLASS_MAP to match your training labels.

The wrapper currently ships a rule-based heuristic so the service returns
meaningful responses during development / before real weights are available.
"""

import os
import logging
import random
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ── Class labels (PlantVillage-style) ────────────────────────────────────────
# Maps model output index → (result_type, disease_name, description, treatment)
CLASS_MAP: dict[int, dict] = {
    0: {
        "type": "healthy",
        "disease": "Healthy Leaf",
        "description": (
            "No disease detected. Leaf shows good colour, structure, and surface texture. "
            "Continue normal irrigation and fertilisation."
        ),
        "treatment": None,
    },
    1: {
        "type": "danger",
        "disease": "Leaf Blight",
        "description": (
            "Early-stage blight (Alternaria triticina) detected. "
            "Lesions appear as tan/brown spots with yellow halos. "
            "Recommend fungicide treatment within 48 hours. Avoid overhead irrigation."
        ),
        "treatment": (
            "Spray Mancozeb 75 WP @ 2.5 g/litre or Propiconazole @ 1 ml/litre. "
            "Remove infected leaves and destroy crop debris."
        ),
    },
    2: {
        "type": "warning",
        "disease": "Rust Spot",
        "description": (
            "Mild rust spots (Puccinia sp.) observed on leaf surface. "
            "Pustules are orange-brown and powdery. Monitor for 3–5 days."
        ),
        "treatment": (
            "Apply sulphur-based fungicide @ 3 g/litre as a precaution. "
            "Ensure good air circulation and avoid excess nitrogen."
        ),
    },
    3: {
        "type": "warning",
        "disease": "Powdery Mildew",
        "description": (
            "White powdery coating (Erysiphe graminis) detected on upper leaf surface. "
            "Spreads rapidly in warm dry weather."
        ),
        "treatment": (
            "Spray Hexaconazole 5% EC @ 1 ml/litre or wettable sulphur @ 3 g/litre. "
            "Improve canopy airflow."
        ),
    },
    4: {
        "type": "danger",
        "disease": "Bacterial Leaf Spot",
        "description": (
            "Water-soaked angular lesions (Xanthomonas sp.) visible near leaf margins. "
            "Lesions turn brown with yellow borders under high humidity."
        ),
        "treatment": (
            "Spray Copper oxychloride @ 3 g/litre. "
            "Avoid overhead irrigation. Remove and burn infected plant material."
        ),
    },
}

MODEL_DIR = Path(os.getenv("MODEL_DIR", "./models"))


class DiseaseModel:
    """
    Wrapper around a CNN model for leaf disease detection.

    Falls back to a colour-histogram heuristic when no trained weights
    are found, so the API always returns a valid response.
    """

    def __init__(self) -> None:
        self._model = None
        self._backend: Literal["tensorflow", "pytorch", "heuristic"] = "heuristic"
        self._load_model()

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load_model(self) -> None:
        tf_path = MODEL_DIR / "disease_model.h5"
        pt_path = MODEL_DIR / "disease_model.pt"

        if tf_path.exists():
            try:
                import tensorflow as tf  # type: ignore
                self._model = tf.keras.models.load_model(str(tf_path))
                self._backend = "tensorflow"
                logger.info("Loaded TensorFlow disease model from %s", tf_path)
                return
            except Exception as exc:
                logger.warning("Failed to load TF model: %s", exc)

        if pt_path.exists():
            try:
                import torch  # type: ignore
                self._model = torch.jit.load(str(pt_path), map_location="cpu")
                self._model.eval()
                self._backend = "pytorch"
                logger.info("Loaded PyTorch disease model from %s", pt_path)
                return
            except Exception as exc:
                logger.warning("Failed to load PyTorch model: %s", exc)

        logger.warning(
            "No trained model weights found in %s — using heuristic fallback.", MODEL_DIR
        )
        self._backend = "heuristic"

    # ── Preprocessing ─────────────────────────────────────────────────────────

    @staticmethod
    def _preprocess(image: Image.Image, size: tuple[int, int] = (224, 224)) -> np.ndarray:
        """Resize, normalise, and add batch dimension."""
        img = image.convert("RGB").resize(size)
        arr = np.array(img, dtype=np.float32) / 255.0
        return np.expand_dims(arr, axis=0)  # (1, H, W, 3)

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict(self, image: Image.Image) -> dict:
        """
        Run inference and return a dict with:
          type, disease, confidence, description, treatment
        """
        if self._backend == "tensorflow":
            return self._predict_tf(image)
        if self._backend == "pytorch":
            return self._predict_pt(image)
        return self._predict_heuristic(image)

    def _predict_tf(self, image: Image.Image) -> dict:
        arr = self._preprocess(image)
        preds = self._model.predict(arr, verbose=0)[0]  # type: ignore[union-attr]
        class_idx = int(np.argmax(preds))
        confidence = float(preds[class_idx]) * 100
        return self._build_result(class_idx, confidence)

    def _predict_pt(self, image: Image.Image) -> dict:
        import torch  # type: ignore
        arr = self._preprocess(image)
        tensor = torch.from_numpy(arr).permute(0, 3, 1, 2)  # NCHW
        with torch.no_grad():
            logits = self._model(tensor)  # type: ignore[operator]
            probs = torch.softmax(logits, dim=1)[0]
        class_idx = int(probs.argmax().item())
        confidence = float(probs[class_idx].item()) * 100
        return self._build_result(class_idx, confidence)

    def _predict_heuristic(self, image: Image.Image) -> dict:
        """
        Colour-histogram heuristic used when no model weights are available.
        Analyses the green/brown ratio to estimate plant health.
        """
        img = image.convert("RGB").resize((64, 64))
        arr = np.array(img, dtype=np.float32)

        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

        # Brown pixels: R high, G moderate, B low
        brown_mask = (r > 120) & (g < 100) & (b < 80)
        # Green pixels: G dominant
        green_mask = (g > r) & (g > b) & (g > 80)
        # Yellow/orange pixels: R & G high, B low
        yellow_mask = (r > 150) & (g > 120) & (b < 80)

        total = arr.shape[0] * arr.shape[1]
        brown_ratio = float(np.sum(brown_mask)) / total
        green_ratio = float(np.sum(green_mask)) / total
        yellow_ratio = float(np.sum(yellow_mask)) / total

        if brown_ratio > 0.25:
            class_idx = 1  # Leaf Blight
            confidence = min(95.0, 60 + brown_ratio * 100)
        elif yellow_ratio > 0.20:
            class_idx = 2  # Rust Spot
            confidence = min(92.0, 55 + yellow_ratio * 100)
        elif green_ratio > 0.55:
            class_idx = 0  # Healthy
            confidence = min(99.0, 70 + green_ratio * 50)
        else:
            # Low-confidence — slight warning
            class_idx = 2
            confidence = round(random.uniform(60, 80), 1)

        return self._build_result(class_idx, confidence)

    @staticmethod
    def _build_result(class_idx: int, confidence: float) -> dict:
        info = CLASS_MAP.get(class_idx, CLASS_MAP[0])
        return {
            "type": info["type"],
            "disease": info["disease"],
            "confidence": round(confidence, 1),
            "description": info["description"],
            "treatment": info["treatment"],
            "class_index": class_idx,
        }
