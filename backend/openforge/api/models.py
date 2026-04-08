"""API endpoints for managing locally-downloaded models (Whisper, embedding, Marker PDF, etc.)."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.common.config import get_settings
from openforge.db.postgres import get_db
from openforge.services.config_service import config_service

logger = logging.getLogger("openforge.api.models")

router = APIRouter()

# ── Subdirectory layout under models_root ──
# /models/whisper/       — faster-whisper CTranslate2 model directories
# /models/embeddings/    — sentence-transformers models (HF cache)
# /models/clip/          — CLIP visual models (HF cache)
# /models/marker/        — Marker PDF models (datalab cache)

WHISPER_SUBDIR = "whisper"
EMBEDDINGS_SUBDIR = "embeddings"
CLIP_SUBDIR = "clip"
MARKER_SUBDIR = "marker"

# Map HuggingFace-style IDs to Whisper CLI model names
WHISPER_MODEL_MAP = {
    "openai/whisper-tiny": "tiny",
    "openai/whisper-base": "base",
    "openai/whisper-small": "small",
    "openai/whisper-medium": "medium",
    "openai/whisper-large-v2": "large-v2",
    "openai/whisper-large-v3": "large-v3",
}


def _whisper_dir() -> Path:
    return Path(get_settings().models_root) / WHISPER_SUBDIR


def _embeddings_dir() -> Path:
    return Path(get_settings().models_root) / EMBEDDINGS_SUBDIR


def _clip_dir() -> Path:
    return Path(get_settings().models_root) / CLIP_SUBDIR


# Known CLIP models (sentence-transformers IDs)
CLIP_MODEL_MAP = {
    "clip-ViT-B-16": "ViT-B/16",
    "clip-ViT-B-32": "ViT-B/32",
    "clip-ViT-L-14": "ViT-L/14",
}


def _clip_is_downloaded(model_id: str) -> bool:
    """Check if a CLIP sentence-transformers model is cached in the clip dir."""
    clip = _clip_dir()
    if not clip.exists():
        return False
    safe_name = model_id.replace("/", "--")
    model_cache = clip / f"models--sentence-transformers--{safe_name}"
    if model_cache.exists() and any(model_cache.rglob("config.json")):
        return True
    alt = clip / safe_name
    if alt.exists() and any(alt.rglob("config.json")):
        return True
    return False


def _clip_disk_size(model_id: str) -> str | None:
    """Get disk size of a downloaded CLIP model."""
    clip = _clip_dir()
    if not clip.exists():
        return None
    safe_name = model_id.replace("/", "--")
    for candidate in [
        clip / f"models--sentence-transformers--{safe_name}",
        clip / safe_name,
    ]:
        if candidate.exists():
            total = sum(f.stat().st_size for f in candidate.rglob("*") if f.is_file())
            if total < 1024 * 1024:
                return f"{total / 1024:.0f} KB"
            if total < 1024 * 1024 * 1024:
                return f"{total / (1024 * 1024):.0f} MB"
            return f"{total / (1024 * 1024 * 1024):.1f} GB"
    return None


def _model_is_downloaded(model_name: str) -> bool:
    """Check if a Whisper model has been downloaded (CTranslate2 format)."""
    ct2_dir = _whisper_dir() / f"faster-whisper-{model_name}"
    return ct2_dir.is_dir() and (ct2_dir / "model.bin").exists()


def _embedding_is_downloaded(model_id: str) -> bool:
    """Check if a sentence-transformers model is cached in embeddings dir."""
    emb_dir = _embeddings_dir()
    if not emb_dir.exists():
        return False
    # sentence-transformers caches under models--<org>--<name>
    safe_name = model_id.replace("/", "--")
    model_cache = emb_dir / f"models--{safe_name}"
    if model_cache.exists() and any(model_cache.rglob("config.json")):
        return True
    # Also check if it was saved directly by name
    alt = emb_dir / safe_name
    if alt.exists() and any(alt.rglob("config.json")):
        return True
    return False


class WhisperModelStatus(BaseModel):
    id: str
    name: str
    downloaded: bool


class EmbeddingModelStatus(BaseModel):
    id: str
    downloaded: bool


class ModelDownloadRequest(BaseModel):
    model_id: str


# ─────────────────────────────────────────────
# Whisper endpoints
# ─────────────────────────────────────────────

@router.get("/whisper", response_model=list[WhisperModelStatus])
async def list_whisper_models():
    """List all known Whisper models with their download status."""
    results = []
    for hf_id, model_name in WHISPER_MODEL_MAP.items():
        results.append(WhisperModelStatus(
            id=hf_id,
            name=model_name,
            downloaded=_model_is_downloaded(model_name),
        ))
    return results


@router.get("/whisper/default")
async def get_default_whisper_model(db: AsyncSession = Depends(get_db)):
    """Get the currently configured default Whisper model."""
    config = await config_service.get_config(db, "local_whisper_model")
    value = config.value if config else ""
    return {"model_id": value}


@router.put("/whisper/default")
async def set_default_whisper_model(
    body: ModelDownloadRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the default Whisper model. Must be downloaded first."""
    model_name = WHISPER_MODEL_MAP.get(body.model_id)
    if not model_name:
        if body.model_id in WHISPER_MODEL_MAP.values():
            model_name = body.model_id
        else:
            raise HTTPException(400, f"Unknown Whisper model: {body.model_id}")

    if not _model_is_downloaded(model_name):
        raise HTTPException(
            400,
            f"Model '{body.model_id}' is not downloaded. Download it first.",
        )

    await config_service.set_config(db, "local_whisper_model", body.model_id, "llm")
    return {"model_id": body.model_id, "name": model_name}


@router.post("/whisper/download", response_model=WhisperModelStatus)
async def download_whisper_model(body: ModelDownloadRequest):
    """Download a Whisper model to the models volume."""
    model_name = WHISPER_MODEL_MAP.get(body.model_id)
    if not model_name:
        if body.model_id in WHISPER_MODEL_MAP.values():
            model_name = body.model_id
        else:
            raise HTTPException(400, f"Unknown Whisper model: {body.model_id}")

    if _model_is_downloaded(model_name):
        return WhisperModelStatus(id=body.model_id, name=model_name, downloaded=True)

    whisper_dir = _whisper_dir()
    whisper_dir.mkdir(parents=True, exist_ok=True)

    try:
        def _do_download():
            from faster_whisper import WhisperModel
            # WhisperModel constructor auto-downloads CTranslate2 models from HuggingFace
            WhisperModel(model_name, device="cpu", compute_type="int8",
                         download_root=str(whisper_dir))

        await asyncio.to_thread(_do_download)
    except Exception as e:
        logger.error("Failed to download Whisper model %s: %s", model_name, e)
        raise HTTPException(500, f"Download failed: {e}")

    return WhisperModelStatus(
        id=body.model_id,
        name=model_name,
        downloaded=_model_is_downloaded(model_name),
    )


@router.delete("/whisper/{model_id:path}")
async def delete_whisper_model(model_id: str):
    """Delete a downloaded Whisper model."""
    model_name = WHISPER_MODEL_MAP.get(model_id)
    if not model_name:
        if model_id in WHISPER_MODEL_MAP.values():
            model_name = model_id
        else:
            raise HTTPException(400, f"Unknown Whisper model: {model_id}")

    ct2_dir = _whisper_dir() / f"faster-whisper-{model_name}"
    if ct2_dir.is_dir():
        shutil.rmtree(ct2_dir)
        logger.info("Deleted Whisper model: %s", model_name)

    return {"deleted": True, "model_id": model_id, "name": model_name}


# ─────────────────────────────────────────────
# Embedding model endpoints
# ─────────────────────────────────────────────

@router.get("/embeddings", response_model=list[EmbeddingModelStatus])
async def list_embedding_models(model_ids: str = ""):
    """Check download status for given embedding model IDs (comma-separated)."""
    if not model_ids:
        return []
    ids = [m.strip() for m in model_ids.split(",") if m.strip()]
    return [
        EmbeddingModelStatus(id=mid, downloaded=_embedding_is_downloaded(mid))
        for mid in ids
    ]


@router.post("/embeddings/download", response_model=EmbeddingModelStatus)
async def download_embedding_model(body: ModelDownloadRequest):
    """Download a sentence-transformers embedding model."""
    model_id = body.model_id
    if _embedding_is_downloaded(model_id):
        return EmbeddingModelStatus(id=model_id, downloaded=True)

    emb_dir = _embeddings_dir()
    emb_dir.mkdir(parents=True, exist_ok=True)

    try:
        def _do_download():
            from sentence_transformers import SentenceTransformer
            SentenceTransformer(
                model_id,
                cache_folder=str(emb_dir),
            )

        await asyncio.to_thread(_do_download)
    except Exception as e:
        logger.error("Failed to download embedding model %s: %s", model_id, e)
        raise HTTPException(500, f"Download failed: {e}")

    return EmbeddingModelStatus(
        id=model_id,
        downloaded=_embedding_is_downloaded(model_id),
    )


@router.delete("/embeddings/{model_id:path}")
async def delete_embedding_model(model_id: str):
    """Delete a downloaded embedding model."""
    emb_dir = _embeddings_dir()
    safe_name = model_id.replace("/", "--")
    deleted = False

    for candidate in [
        emb_dir / f"models--{safe_name}",
        emb_dir / safe_name,
    ]:
        if candidate.exists():
            shutil.rmtree(candidate)
            deleted = True
            logger.info("Deleted embedding model dir: %s", candidate)

    return {"deleted": deleted, "model_id": model_id}


# ─────────────────────────────────────────────
# Marker PDF endpoints
# ─────────────────────────────────────────────

def _marker_dir() -> Path:
    return Path(get_settings().models_root) / MARKER_SUBDIR


def _marker_is_downloaded() -> bool:
    """Check if Marker models have been downloaded."""
    marker_dir = _marker_dir()
    if not marker_dir.exists():
        return False
    # Marker stores models in subdirectories; check for any model folder
    # with actual weight files (.safetensors, .bin, .pt)
    for p in marker_dir.rglob("*.safetensors"):
        return True
    for p in marker_dir.rglob("*.bin"):
        if p.name != "training_args.bin":
            return True
    for p in marker_dir.rglob("*.pt"):
        return True
    return False


def _marker_disk_size() -> str | None:
    """Get the total disk size of the marker models directory."""
    marker_dir = _marker_dir()
    if not marker_dir.exists():
        return None
    total = sum(f.stat().st_size for f in marker_dir.rglob("*") if f.is_file())
    if total < 1024 * 1024:
        return f"{total / 1024:.0f} KB"
    if total < 1024 * 1024 * 1024:
        return f"{total / (1024 * 1024):.0f} MB"
    return f"{total / (1024 * 1024 * 1024):.1f} GB"


class MarkerModelStatus(BaseModel):
    id: str
    name: str
    downloaded: bool
    downloading: bool = False
    disk_size: str | None = None


# Track in-flight download
_marker_downloading = False


@router.get("/marker", response_model=list[MarkerModelStatus])
async def list_marker_models():
    """List Marker PDF model with its download status."""
    downloaded = _marker_is_downloaded()
    return [
        MarkerModelStatus(
            id="marker-pdf",
            name="Marker PDF",
            downloaded=downloaded,
            downloading=_marker_downloading,
            disk_size=_marker_disk_size() if downloaded else None,
        )
    ]


@router.post("/marker/download", response_model=MarkerModelStatus)
async def download_marker_model():
    """Download Marker PDF models to the shared models volume.

    Runs in a subprocess to avoid memory issues in the API server.
    """
    global _marker_downloading

    if _marker_is_downloaded():
        return MarkerModelStatus(
            id="marker-pdf",
            name="Marker PDF",
            downloaded=True,
            disk_size=_marker_disk_size(),
        )

    if _marker_downloading:
        raise HTTPException(409, "Marker model download already in progress")

    marker_dir = _marker_dir()
    marker_dir.mkdir(parents=True, exist_ok=True)

    # Download model files only — don't load them into memory (avoids OOM).
    # Marker/Surya uses its own S3 download scheme. We call download_directory()
    # for each model checkpoint, which downloads weights without torch model instantiation.
    script = """
import os, sys, traceback
os.environ["DATALAB_MODELS_DIR"] = sys.argv[1]
try:
    from surya.settings import settings as surya_settings
    surya_settings.MODEL_CACHE_DIR = sys.argv[1]

    from surya.common.s3 import download_directory

    S3_PREFIX = "s3://"
    checkpoints = [
        surya_settings.LAYOUT_MODEL_CHECKPOINT,
        surya_settings.RECOGNITION_MODEL_CHECKPOINT,
        surya_settings.DETECTOR_MODEL_CHECKPOINT,
        surya_settings.TABLE_REC_MODEL_CHECKPOINT,
        surya_settings.OCR_ERROR_MODEL_CHECKPOINT,
    ]

    for cp in checkpoints:
        # Strip s3:// prefix (same as S3DownloaderMixin.from_pretrained does)
        remote_path = cp.replace(S3_PREFIX, "") if cp.startswith(S3_PREFIX) else cp
        local_dir = os.path.join(sys.argv[1], remote_path)
        os.makedirs(local_dir, exist_ok=True)
        print(f"Downloading {remote_path}...", flush=True)
        download_directory(remote_path, local_dir)

    print("OK")
except Exception:
    traceback.print_exc()
    sys.exit(1)
"""
    _marker_downloading = True
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-u", "-c", script, str(marker_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)

        if proc.returncode != 0:
            stderr_text = stderr.decode(errors="replace")[-1000:] if stderr else ""
            stdout_text = stdout.decode(errors="replace")[-500:] if stdout else ""
            error_detail = stderr_text or stdout_text or f"exit code {proc.returncode}"
            logger.error("Marker model download failed (exit %d): %s", proc.returncode, error_detail)
            raise HTTPException(500, f"Download failed: {error_detail}")

    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise HTTPException(500, "Model download timed out (10 min)")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Marker model download error: %s", e)
        raise HTTPException(500, f"Download failed: {e}")
    finally:
        _marker_downloading = False

    return MarkerModelStatus(
        id="marker-pdf",
        name="Marker PDF",
        downloaded=_marker_is_downloaded(),
        disk_size=_marker_disk_size(),
    )


@router.delete("/marker")
async def delete_marker_model():
    """Delete downloaded Marker PDF models."""
    marker_dir = _marker_dir()
    deleted = False

    if marker_dir.exists():
        shutil.rmtree(marker_dir)
        deleted = True
        logger.info("Deleted Marker PDF models dir: %s", marker_dir)

    return {"deleted": deleted, "model_id": "marker-pdf"}


# ─────────────────────────────────────────────
# CLIP visual model endpoints
# ─────────────────────────────────────────────

class CLIPModelStatus(BaseModel):
    id: str
    name: str
    downloaded: bool
    disk_size: str | None = None


@router.get("/clip", response_model=list[CLIPModelStatus])
async def list_clip_models():
    """List all known CLIP models with their download status."""
    results = []
    for model_id, display_name in CLIP_MODEL_MAP.items():
        downloaded = _clip_is_downloaded(model_id)
        results.append(CLIPModelStatus(
            id=model_id,
            name=display_name,
            downloaded=downloaded,
            disk_size=_clip_disk_size(model_id) if downloaded else None,
        ))
    return results


@router.get("/clip/default")
async def get_default_clip_model(db: AsyncSession = Depends(get_db)):
    """Get the currently configured default CLIP model."""
    config = await config_service.get_config(db, "clip_model")
    value = config.value if config else get_settings().clip_model
    return {"model_id": value}


@router.put("/clip/default")
async def set_default_clip_model(
    body: ModelDownloadRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the default CLIP model. Must be downloaded first."""
    if body.model_id not in CLIP_MODEL_MAP:
        raise HTTPException(400, f"Unknown CLIP model: {body.model_id}")

    if not _clip_is_downloaded(body.model_id):
        raise HTTPException(
            400,
            f"Model '{body.model_id}' is not downloaded. Download it first.",
        )

    old_model = config_value.value if (config_value := await config_service.get_config(db, "clip_model")) else None

    await config_service.set_config(db, "clip_model", body.model_id, "llm")

    # Invalidate cached model so next image processing picks up the new one
    try:
        from openforge.core.knowledge_processors.image_processor import ImageProcessor
        ImageProcessor._clip_model = None
    except Exception:
        pass

    # Auto-trigger image re-indexing if the model actually changed
    if old_model != body.model_id:
        try:
            import asyncio as _asyncio
            from sqlalchemy import select as _sel
            from openforge.db.postgres import AsyncSessionLocal
            from openforge.db.models import Knowledge
            from openforge.api.knowledge_upload import _process_knowledge_file

            async def _reindex():
                async with AsyncSessionLocal() as _db:
                    rows = (await _db.execute(
                        _sel(Knowledge).where(Knowledge.type == "image", Knowledge.file_path.isnot(None))
                    )).scalars().all()
                    items = [(k.id, k.workspace_id, k.file_path) for k in rows]
                for kid, wid, fpath in items:
                    try:
                        await _process_knowledge_file(knowledge_id=kid, workspace_id=wid, knowledge_type="image", file_path=fpath)
                    except Exception as e:
                        logger.warning("Auto re-index image %s failed: %s", kid, e)
                logger.info("Auto image re-indexing after CLIP model change complete (%d items).", len(items))

            _asyncio.create_task(_reindex())
        except Exception:
            pass

    return {"model_id": body.model_id, "name": CLIP_MODEL_MAP[body.model_id]}


@router.post("/clip/download", response_model=CLIPModelStatus)
async def download_clip_model(body: ModelDownloadRequest):
    """Download a CLIP model to the models volume."""
    if body.model_id not in CLIP_MODEL_MAP:
        raise HTTPException(400, f"Unknown CLIP model: {body.model_id}")

    if _clip_is_downloaded(body.model_id):
        return CLIPModelStatus(
            id=body.model_id,
            name=CLIP_MODEL_MAP[body.model_id],
            downloaded=True,
            disk_size=_clip_disk_size(body.model_id),
        )

    clip = _clip_dir()
    clip.mkdir(parents=True, exist_ok=True)

    try:
        def _do_download():
            from sentence_transformers import SentenceTransformer
            SentenceTransformer(body.model_id, cache_folder=str(clip))

        await asyncio.to_thread(_do_download)
    except Exception as e:
        logger.error("Failed to download CLIP model %s: %s", body.model_id, e)
        raise HTTPException(500, f"Download failed: {e}")

    return CLIPModelStatus(
        id=body.model_id,
        name=CLIP_MODEL_MAP[body.model_id],
        downloaded=_clip_is_downloaded(body.model_id),
        disk_size=_clip_disk_size(body.model_id),
    )


@router.delete("/clip/{model_id:path}")
async def delete_clip_model(model_id: str):
    """Delete a downloaded CLIP model."""
    if model_id not in CLIP_MODEL_MAP:
        raise HTTPException(400, f"Unknown CLIP model: {model_id}")

    clip = _clip_dir()
    safe_name = model_id.replace("/", "--")
    deleted = False

    for candidate in [
        clip / f"models--sentence-transformers--{safe_name}",
        clip / safe_name,
    ]:
        if candidate.exists():
            shutil.rmtree(candidate)
            deleted = True
            logger.info("Deleted CLIP model dir: %s", candidate)

    # Invalidate cached model if the active model was deleted
    try:
        from openforge.common.config import get_settings
        if get_settings().clip_model == model_id:
            from openforge.core.knowledge_processors.image_processor import ImageProcessor
            ImageProcessor._clip_model = None
    except Exception:
        pass

    return {"deleted": deleted, "model_id": model_id}


# ─────────────────────────────────────────────
# Re-indexing endpoints
# ─────────────────────────────────────────────

@router.post("/reindex/images")
async def reindex_images():
    """Re-process CLIP embeddings for all image knowledge items."""
    import asyncio as _asyncio
    from sqlalchemy import select as _sel
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.db.models import Knowledge
    from openforge.api.knowledge_upload import _process_knowledge_file

    async def _run():
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                _sel(Knowledge).where(Knowledge.type == "image", Knowledge.file_path.isnot(None))
            )).scalars().all()
            items = [(k.id, k.workspace_id, k.file_path) for k in rows]

        count = 0
        for kid, wid, fpath in items:
            try:
                await _process_knowledge_file(
                    knowledge_id=kid,
                    workspace_id=wid,
                    knowledge_type="image",
                    file_path=fpath,
                )
                count += 1
            except Exception as e:
                logger.warning("Image re-index failed for %s: %s", kid, e)
        logger.info("Image re-indexing complete: %d/%d items.", count, len(items))

    _asyncio.create_task(_run())
    return {"status": "started", "message": "Image re-indexing started in background"}


@router.post("/reindex/knowledge")
async def reindex_knowledge():
    """Re-process text embeddings for all knowledge items."""
    import asyncio as _asyncio
    from sqlalchemy import select as _sel
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.db.models import Knowledge

    async def _run():
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(_sel(Knowledge))).scalars().all()
            items = [(k.id, k.workspace_id, k.content or "", k.type or "note", k.title) for k in rows]

        from openforge.services.knowledge_processing_service import knowledge_processing_service
        count = 0
        for kid, wid, content, ktype, title in items:
            try:
                await knowledge_processing_service._process_knowledge_background(
                    kid, wid, content, ktype, title
                )
                count += 1
            except Exception as e:
                logger.warning("Knowledge re-index failed for %s: %s", kid, e)
        logger.info("Knowledge re-indexing complete: %d/%d items.", count, len(items))

    _asyncio.create_task(_run())
    return {"status": "started", "message": "Knowledge re-indexing started in background"}
