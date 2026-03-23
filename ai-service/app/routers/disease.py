"""
Disease detection router.
POST /disease/detect — accepts a multipart image upload
"""

import io
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException, Request
from pydantic import BaseModel
from PIL import Image

logger = logging.getLogger(__name__)
router = APIRouter()


class DiseaseResponse(BaseModel):
    type: str           # "healthy" | "warning" | "danger"
    disease: str
    confidence: float
    description: str
    treatment: str | None = None
    class_index: int


@router.post("/detect", response_model=DiseaseResponse)
async def detect_disease(request: Request, image: UploadFile = File(...)):
    """
    Accepts a JPEG/PNG image and returns a disease detection result.

    The response JSON exactly matches the shape expected by the
    Node.js backend (and ultimately the frontend DISEASE_MOCKS format):
    {
      "type":        "danger" | "warning" | "healthy",
      "disease":     str,
      "confidence":  float,   // 0–100
      "description": str,
      "treatment":   str | null,
      "class_index": int
    }
    """
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    if image.content_type not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{image.content_type}'. Use JPEG/PNG/WebP.",
        )

    try:
        contents = await image.read()
        pil_image = Image.open(io.BytesIO(contents))
    except Exception as exc:
        logger.error("Failed to decode image: %s", exc)
        raise HTTPException(status_code=422, detail="Invalid image file")

    model = request.app.state.disease_model
    try:
        result = model.predict(pil_image)
    except Exception as exc:
        logger.exception("Disease model inference failed: %s", exc)
        raise HTTPException(status_code=500, detail="Model inference error")

    return DiseaseResponse(**result)
