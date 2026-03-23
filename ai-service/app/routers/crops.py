"""
Crop recommendation router.
POST /crops/recommend — accepts soil/climate parameters
"""

import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class CropRecommendRequest(BaseModel):
    soil:     str   = Field("loamy",  description="Soil type: loamy, clay, sandy, silt, black, red")
    ph:       float = Field(6.5,      ge=3.0, le=10.0, description="Soil pH")
    rainfall: float = Field(800.0,    ge=0,   description="Annual rainfall in mm")
    temp:     float = Field(25.0,     description="Average temperature in °C")
    region:   str   = Field("Punjab", description="State / region in India")
    season:   str   = Field("rabi",   description="Season: rabi, kharif, zaid")
    nitrogen: float = Field(50.0,     ge=0,   description="Soil nitrogen (kg/ha)")
    water:    str   = Field("medium", description="Water availability: low, medium, high")


class CropItem(BaseModel):
    emoji: str
    name:  str
    score: float
    why:   str


class CropRecommendResponse(BaseModel):
    crops:   list[CropItem]
    summary: str


@router.post("/recommend", response_model=CropRecommendResponse)
async def recommend_crops(body: CropRecommendRequest, request: Request):
    """
    Returns up to 6 ranked crop recommendations.

    The response JSON exactly matches the shape expected by the
    Node.js backend (and ultimately the frontend MOCK.cropRec format):
    {
      "crops": [
        { "emoji": "🌾", "name": "Wheat", "score": 95, "why": "..." },
        ...
      ],
      "summary": "..."
    }
    """
    model = request.app.state.crop_model
    try:
        crops = model.recommend(body.model_dump())
    except Exception as exc:
        logger.exception("Crop model inference failed: %s", exc)
        raise HTTPException(status_code=500, detail="Model inference error")

    if not crops:
        raise HTTPException(status_code=500, detail="No recommendations generated")

    top = crops[0]["name"]
    summary = (
        f"Based on {body.soil} soil (pH {body.ph}), {body.rainfall} mm rainfall, "
        f"and {body.season} season in {body.region}, "
        f"{top} is your best option with {crops[0]['score']}% match score."
    )

    return CropRecommendResponse(crops=crops, summary=summary)
