"""TTS model management API endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from openforge.services.config_service import config_service
from openforge.services.local_models import get_local_models_with_status

logger = logging.getLogger("openforge.api.tts")

router = APIRouter()

TTS_DEFAULT_CONFIG_KEY = "system_tts_default"


class TTSModelStatus(BaseModel):
    id: str
    name: str
    capability_type: str
    engine: str | None = None
    size_mb: int
    requires_gpu: bool
    downloaded: bool


class TTSDownloadRequest(BaseModel):
    model_id: str


class TTSDefaultResponse(BaseModel):
    model_id: str | None = None


class TTSDefaultSetRequest(BaseModel):
    model_id: str


@router.get("/", response_model=list[TTSModelStatus])
async def list_tts_models():
    """List available TTS models with download status."""
    models = get_local_models_with_status(capability_type="tts")
    return [TTSModelStatus(**m) for m in models]


@router.post("/download")
async def download_tts_model(body: TTSDownloadRequest):
    """Trigger download of a TTS model (placeholder — actual download logic comes later)."""
    from openforge.services.local_models import _MODEL_BY_ID

    model = _MODEL_BY_ID.get(body.model_id)
    if not model or model.capability_type != "tts":
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {body.model_id}")

    return {
        "status": "accepted",
        "model_id": body.model_id,
        "message": f"Download of '{model.name}' has been queued. Actual download logic is not yet implemented.",
    }


@router.delete("/{model_id}")
async def delete_tts_model(model_id: str):
    """Delete a downloaded TTS model (placeholder — actual deletion logic comes later)."""
    from openforge.services.local_models import _MODEL_BY_ID

    model = _MODEL_BY_ID.get(model_id)
    if not model or model.capability_type != "tts":
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {model_id}")

    return {
        "deleted": False,
        "model_id": model_id,
        "message": "TTS model deletion is not yet implemented.",
    }


@router.get("/default", response_model=TTSDefaultResponse)
async def get_default_tts_model(db: AsyncSession = Depends(get_db)):
    """Get the currently configured default TTS model."""
    config = await config_service.get_config(db, TTS_DEFAULT_CONFIG_KEY)
    value = config.value if config else None
    return TTSDefaultResponse(model_id=value)


@router.put("/default", response_model=TTSDefaultResponse)
async def set_default_tts_model(
    body: TTSDefaultSetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the default TTS model."""
    from openforge.services.local_models import _MODEL_BY_ID

    model = _MODEL_BY_ID.get(body.model_id)
    if not model or model.capability_type != "tts":
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {body.model_id}")

    await config_service.set_config(db, TTS_DEFAULT_CONFIG_KEY, body.model_id, "llm")
    return TTSDefaultResponse(model_id=body.model_id)
