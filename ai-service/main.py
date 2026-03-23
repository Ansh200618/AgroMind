"""
Agro Mind — AI Microservice
FastAPI application providing:
  POST /disease/detect   — CNN-based leaf disease detection
  POST /crops/recommend  — Scikit-learn crop recommendation
  GET  /health           — Health check
"""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import disease, crops

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "info").upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("agro-mind-ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models once at startup, release on shutdown."""
    logger.info("Loading ML models …")
    # Import here so models are initialised before any request arrives
    from app.models.disease_model import DiseaseModel
    from app.models.crop_model import CropModel

    app.state.disease_model = DiseaseModel()
    app.state.crop_model = CropModel()
    logger.info("Models loaded ✓")
    yield
    logger.info("Shutting down AI service")


app = FastAPI(
    title="Agro Mind AI Service",
    description="CNN disease detection & Scikit-learn crop recommendation for Indian agriculture",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(disease.router, prefix="/disease", tags=["Disease Detection"])
app.include_router(crops.router,   prefix="/crops",   tags=["Crop Recommendation"])


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "agro-mind-ai"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
