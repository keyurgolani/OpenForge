"""TTS model management API endpoints."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.common.config import get_settings
from openforge.db.postgres import get_db
from openforge.services.config_service import config_service
from openforge.services.local_models import get_local_models_with_status

logger = logging.getLogger("openforge.api.tts")

router = APIRouter()

PIPER_SUBDIR = "piper"
COQUI_SUBDIR = "coqui"

# Piper voice download URLs (rhasspy/piper ONNX format)
PIPER_VOICE_MAP: dict[str, dict[str, str]] = {
    "piper-en-us-amy": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/low/en_US-amy-low.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/low/en_US-amy-low.onnx.json",
    },
    "piper-en-us-lessac": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
    },
    "piper-en-gb-alba": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json",
    },
    "piper-de-thorsten": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json",
    },
    "piper-fr-siwis": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json",
    },
    "piper-es-mls": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx.json",
    },
}


def _piper_dir() -> Path:
    return Path(get_settings().models_root) / PIPER_SUBDIR


def _coqui_dir() -> Path:
    return Path(get_settings().models_root) / COQUI_SUBDIR


def _piper_is_downloaded(model_id: str) -> bool:
    piper_dir = _piper_dir()
    return (piper_dir / f"{model_id}.onnx").exists()


def _coqui_is_downloaded(model_id: str) -> bool:
    coqui_dir = _coqui_dir()
    return (coqui_dir / model_id).is_dir()

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
    """Download a TTS model to the persistent models directory."""
    from openforge.services.local_models import _MODEL_BY_ID

    model = _MODEL_BY_ID.get(body.model_id)
    if not model or model.capability_type != "tts":
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {body.model_id}")

    if model.engine == "piper":
        if _piper_is_downloaded(body.model_id):
            return {"status": "complete", "model_id": body.model_id, "downloaded": True}

        voice_urls = PIPER_VOICE_MAP.get(body.model_id)
        if not voice_urls:
            raise HTTPException(status_code=400, detail=f"No download URL configured for Piper voice: {body.model_id}")

        piper_dir = _piper_dir()
        piper_dir.mkdir(parents=True, exist_ok=True)

        try:
            def _do_download():
                import urllib.request
                for suffix, url in voice_urls.items():
                    ext = ".onnx" if suffix == "onnx" else ".onnx.json"
                    dest = piper_dir / f"{body.model_id}{ext}"
                    logger.info("Downloading Piper model %s from %s", body.model_id, url)
                    urllib.request.urlretrieve(url, str(dest))

            await asyncio.to_thread(_do_download)
        except Exception as e:
            logger.error("Failed to download Piper model %s: %s", body.model_id, e)
            raise HTTPException(status_code=500, detail=f"Download failed: {e}")

        return {"status": "complete", "model_id": body.model_id, "downloaded": _piper_is_downloaded(body.model_id)}

    elif model.engine == "coqui":
        if _coqui_is_downloaded(body.model_id):
            return {"status": "complete", "model_id": body.model_id, "downloaded": True}

        coqui_dir = _coqui_dir()
        coqui_dir.mkdir(parents=True, exist_ok=True)
        model_dir = coqui_dir / body.model_id
        model_dir.mkdir(parents=True, exist_ok=True)

        try:
            def _do_download():
                os.environ["COQUI_TOS_AGREED"] = "1"
                from TTS.api import TTS
                TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
                # Move downloaded files to our persistent directory
                default_cache = Path.home() / ".local" / "share" / "tts"
                if default_cache.exists():
                    for item in default_cache.rglob("*"):
                        if item.is_file():
                            dest = model_dir / item.relative_to(default_cache)
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(str(item), str(dest))

            await asyncio.to_thread(_do_download)
        except Exception as e:
            logger.error("Failed to download Coqui model %s: %s", body.model_id, e)
            raise HTTPException(status_code=500, detail=f"Download failed: {e}")

        return {"status": "complete", "model_id": body.model_id, "downloaded": _coqui_is_downloaded(body.model_id)}

    elif model.engine == "liquid-audio":
        liquid_dir = Path(get_settings().models_root) / "liquid-audio"
        if liquid_dir.exists() and (any(liquid_dir.rglob("*.safetensors")) or any(liquid_dir.rglob("*.bin"))):
            return {"status": "complete", "model_id": body.model_id, "downloaded": True}

        liquid_dir.mkdir(parents=True, exist_ok=True)

        try:
            def _do_download():
                from huggingface_hub import snapshot_download
                snapshot_download(
                    "LiquidAI/LFM2.5-Audio-1.5B",
                    local_dir=str(liquid_dir),
                    local_dir_use_symlinks=False,
                )

            await asyncio.to_thread(_do_download)
        except Exception as e:
            logger.error("Failed to download liquid-audio model: %s", e)
            raise HTTPException(status_code=500, detail=f"Download failed: {e}")

        return {"status": "complete", "model_id": body.model_id, "downloaded": True}

    raise HTTPException(status_code=400, detail=f"Unsupported TTS engine: {model.engine}")


@router.delete("/{model_id}")
async def delete_tts_model(model_id: str):
    """Delete a downloaded TTS model from the persistent models directory."""
    from openforge.services.local_models import _MODEL_BY_ID

    model = _MODEL_BY_ID.get(model_id)
    if not model or model.capability_type != "tts":
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {model_id}")

    deleted = False

    if model.engine == "piper":
        piper_dir = _piper_dir()
        for path in [piper_dir / f"{model_id}.onnx", piper_dir / f"{model_id}.onnx.json"]:
            if path.exists():
                path.unlink()
                deleted = True
        # Also check for subdirectory
        subdir = piper_dir / model_id
        if subdir.is_dir():
            shutil.rmtree(subdir)
            deleted = True

    elif model.engine == "coqui":
        coqui_dir = _coqui_dir()
        model_dir = coqui_dir / model_id
        if model_dir.is_dir():
            shutil.rmtree(model_dir)
            deleted = True

    elif model.engine == "liquid-audio":
        liquid_dir = Path(get_settings().models_root) / "liquid-audio"
        if liquid_dir.exists():
            shutil.rmtree(liquid_dir)
            deleted = True
            logger.info("Deleted liquid-audio model dir: %s", liquid_dir)

    if deleted:
        logger.info("Deleted TTS model: %s", model_id)

    return {"deleted": deleted, "model_id": model_id}


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


class TTSSynthesizeRequest(BaseModel):
    text: str
    model_id: str = ""


@router.post("/synthesize")
async def synthesize_speech(
    body: TTSSynthesizeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Synthesize speech from text using the configured TTS engine."""
    from openforge.services.local_models import _MODEL_BY_ID
    from openforge.services.config_service import config_service

    model_id = body.model_id
    if not model_id:
        config = await config_service.get_config(db, "local_tts_model")
        model_id = (config.value if config else "") or ""

    model = _MODEL_BY_ID.get(model_id)
    if not model or model.capability_type != "tts":
        raise HTTPException(status_code=400, detail=f"Unknown TTS model: {model_id}")

    if model.engine == "liquid-audio":
        from openforge.core.liquid_audio_engine import synthesize as liquid_synthesize
        try:
            wav_bytes = await asyncio.to_thread(
                liquid_synthesize, body.text, get_settings().models_root
            )
            from fastapi.responses import Response
            return Response(content=wav_bytes, media_type="audio/wav")
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        except Exception as e:
            logger.error("Liquid-audio TTS failed: %s", e)
            raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {e}")

    raise HTTPException(status_code=400, detail=f"TTS synthesis not supported for engine: {model.engine}")
