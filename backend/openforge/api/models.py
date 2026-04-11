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
            size = _dir_size_str(candidate)
            if size:
                return size
    return None


def _model_is_downloaded(model_name: str) -> bool:
    """Check if a Whisper model has been downloaded (CTranslate2 or HF cache format)."""
    whisper = _whisper_dir()
    # CTranslate2 direct format
    ct2_dir = whisper / f"faster-whisper-{model_name}"
    if ct2_dir.is_dir() and (ct2_dir / "model.bin").exists():
        return True
    # HuggingFace cache format (faster-whisper downloads as models--Systran--faster-whisper-{name})
    hf_cache = whisper / f"models--Systran--faster-whisper-{model_name}"
    if hf_cache.is_dir() and any(hf_cache.rglob("model.bin")):
        return True
    return False


def _embedding_is_downloaded(model_id: str) -> bool:
    """Check if a sentence-transformers model is cached in embeddings dir."""
    emb_dir = _embeddings_dir()
    if not emb_dir.exists():
        return False
    safe_name = model_id.replace("/", "--")
    # Check multiple cache naming patterns
    candidates = [
        emb_dir / f"models--{safe_name}",
        emb_dir / f"models--sentence-transformers--{safe_name}",
        emb_dir / f"models--BAAI--{safe_name}",
        emb_dir / f"models--intfloat--{safe_name}",
        emb_dir / safe_name,
    ]
    for candidate in candidates:
        if candidate.exists() and any(candidate.rglob("config.json")):
            return True
    return False


def _dir_size_bytes(path: Path) -> int:
    """Compute directory size in bytes, skipping symlinks to avoid double-counting in HF cache."""
    if not path.exists():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file() and not f.is_symlink())


def _format_size(total: int) -> str | None:
    """Format bytes to human-readable string."""
    if total <= 0:
        return None
    if total < 1_000_000:
        return f"{total / 1_000:.0f} KB"
    elif total < 1_000_000_000:
        return f"{total / 1_000_000:.1f} MB"
    else:
        return f"{total / 1_000_000_000:.2f} GB"


def _dir_size_str(path: Path) -> str | None:
    """Compute human-readable directory size, skipping symlinks."""
    return _format_size(_dir_size_bytes(path))


class WhisperModelStatus(BaseModel):
    id: str
    name: str
    downloaded: bool


class EmbeddingModelStatus(BaseModel):
    id: str
    downloaded: bool


class ModelDownloadRequest(BaseModel):
    model_id: str


class ModelStatusItem(BaseModel):
    model_id: str
    name: str
    downloaded: bool
    downloading: bool = False
    disk_size: str | None = None
    estimated_size: str | None = None
    is_default: bool = False


# Estimated model sizes for display before download (approximate)
_WHISPER_ESTIMATED_SIZES: dict[str, str] = {
    "tiny": "~75 MB",
    "base": "~150 MB",
    "small": "~500 MB",
    "medium": "~1.5 GB",
    "large-v2": "~3.0 GB",
    "large-v3": "~3.0 GB",
}
_CLIP_ESTIMATED_SIZES: dict[str, str] = {
    "clip-ViT-B-32": "~350 MB",
    "clip-ViT-B-16": "~600 MB",
    "clip-ViT-L-14": "~1.7 GB",
}
_MARKER_ESTIMATED_SIZE = "~3.5 GB"
_EMBEDDING_ESTIMATED_SIZE = "~90 MB"


class ModelCategoryStatus(BaseModel):
    category: str
    display_name: str
    icon: str
    models: list[ModelStatusItem]
    total_disk_size: str | None = None


class UnifiedModelStatus(BaseModel):
    categories: list[ModelCategoryStatus]


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

    whisper = _whisper_dir()
    for candidate in [
        whisper / f"faster-whisper-{model_name}",
        whisper / f"models--Systran--faster-whisper-{model_name}",
    ]:
        if candidate.is_dir():
            shutil.rmtree(candidate)
            logger.info("Deleted Whisper model directory: %s", candidate)

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


# Map short embedding model IDs to full HuggingFace IDs for download
_EMBEDDING_HF_MAP: dict[str, str] = {
    "all-MiniLM-L6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "all-mpnet-base-v2": "sentence-transformers/all-mpnet-base-v2",
    "bge-small-en-v1.5": "BAAI/bge-small-en-v1.5",
    "bge-base-en-v1.5": "BAAI/bge-base-en-v1.5",
    "e5-small-v2": "intfloat/e5-small-v2",
    "e5-base-v2": "intfloat/e5-base-v2",
}


@router.post("/embeddings/download", response_model=EmbeddingModelStatus)
async def download_embedding_model(body: ModelDownloadRequest):
    """Download a sentence-transformers embedding model."""
    model_id = body.model_id
    if _embedding_is_downloaded(model_id):
        return EmbeddingModelStatus(id=model_id, downloaded=True)

    emb_dir = _embeddings_dir()
    emb_dir.mkdir(parents=True, exist_ok=True)

    # Resolve to full HF ID for download
    hf_id = _EMBEDDING_HF_MAP.get(model_id, model_id)

    try:
        def _do_download():
            from sentence_transformers import SentenceTransformer
            SentenceTransformer(
                hf_id,
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
        emb_dir / f"models--sentence-transformers--{safe_name}",
        emb_dir / f"models--BAAI--{safe_name}",
        emb_dir / f"models--intfloat--{safe_name}",
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
# Docling endpoints
# ─────────────────────────────────────────────

DOCLING_SUBDIR = "docling"


def _docling_dir() -> Path:
    return Path(get_settings().models_root) / DOCLING_SUBDIR


_DOCLING_DOWNLOAD_SCRIPT = """\
import sys, json, tempfile, os
# Force HF cache into the docling subdirectory
docling_cache = sys.argv[1]
os.environ["HF_HOME"] = docling_cache

try:
    from docling.document_converter import DocumentConverter

    # Create a minimal PDF to trigger model download
    pdf_path = os.path.join(tempfile.gettempdir(), "_docling_warmup.pdf")
    try:
        import fitz
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Docling warmup document.")
        doc.save(pdf_path)
        doc.close()
    except Exception:
        with open(pdf_path, "wb") as f:
            f.write(b"%PDF-1.0\\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\\n"
                    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\\n"
                    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\\n"
                    b"xref\\n0 4\\ntrailer<</Size 4/Root 1 0 R>>\\nstartxref\\n0\\n%%EOF")

    converter = DocumentConverter()
    converter.convert(pdf_path)
    os.unlink(pdf_path)
    print(json.dumps({"status": "complete"}))
except Exception as e:
    print(json.dumps({"status": "error", "error": str(e)}), file=sys.stderr)
    sys.exit(1)
"""


def _docling_is_downloaded() -> bool:
    """Check if Docling models are downloaded under {models_root}/docling."""
    docling = _docling_dir()
    if docling.exists():
        # Check for HF hub model dirs
        hub = docling / "hub"
        if hub.exists():
            for d in hub.iterdir():
                name_lower = d.name.lower()
                if ("docling" in name_lower or "ds4sd" in name_lower) and d.is_dir():
                    return True
        # Also check for any safetensors directly
        if any(docling.rglob("*.safetensors")) or any(docling.rglob("*.onnx")):
            return True

    # Legacy: check HF_HOME for previously downloaded models
    hf_home = os.environ.get("HF_HOME", "")
    if hf_home:
        hub_dir = Path(hf_home) / "hub"
        if hub_dir.exists():
            for d in hub_dir.iterdir():
                name_lower = d.name.lower()
                if "docling" in name_lower or "ds4sd" in name_lower:
                    return True
    return False


def _docling_disk_size() -> str | None:
    """Get disk size of downloaded Docling models."""
    docling = _docling_dir()
    if docling.exists() and _dir_size_bytes(docling) > 0:
        return _dir_size_str(docling)

    # Legacy: check HF_HOME
    hf_home = os.environ.get("HF_HOME", "")
    if hf_home:
        hub_dir = Path(hf_home) / "hub"
        if hub_dir.exists():
            total = 0
            for d in hub_dir.iterdir():
                name_lower = d.name.lower()
                if ("docling" in name_lower or "ds4sd" in name_lower) and d.is_dir():
                    total += _dir_size_bytes(d)
            return _format_size(total)
    return None


@router.post("/docling/download")
async def download_docling_model():
    """Download Docling models into {models_root}/docling."""
    if _docling_is_downloaded():
        return {"status": "complete", "model_id": "docling", "downloaded": True}

    docling = _docling_dir()
    docling.mkdir(parents=True, exist_ok=True)

    try:
        env = {**os.environ, "HF_HOME": str(docling)}
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-c", _DOCLING_DOWNLOAD_SCRIPT, str(docling),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)

        if proc.returncode != 0:
            stderr_text = stderr.decode(errors="replace")[-500:] if stderr else ""
            logger.error("Docling download failed: %s", stderr_text)
            raise HTTPException(500, f"Docling download failed: {stderr_text}")

        return {"status": "complete", "model_id": "docling", "downloaded": True}
    except asyncio.TimeoutError:
        raise HTTPException(500, "Docling download timed out after 10 minutes")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Docling download error: %s", e)
        raise HTTPException(500, f"Download failed: {e}")


@router.delete("/docling")
async def delete_docling_model():
    """Delete downloaded Docling models."""
    deleted = False
    # Remove from {models_root}/docling
    docling = _docling_dir()
    if docling.exists():
        shutil.rmtree(docling)
        deleted = True
        logger.info("Deleted Docling models dir: %s", docling)

    # Also clean legacy HF_HOME location
    hf_home = os.environ.get("HF_HOME", "")
    if hf_home:
        hub_dir = Path(hf_home) / "hub"
        if hub_dir.exists():
            for d in list(hub_dir.iterdir()):
                name_lower = d.name.lower()
                if ("docling" in name_lower or "ds4sd" in name_lower) and d.is_dir():
                    shutil.rmtree(d)
                    deleted = True

    return {"deleted": deleted, "model_id": "docling"}


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
        from openforge.core.pipeline.backends.clip_backend import CLIPBackend
        CLIPBackend._clip_model = None
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
            from openforge.core.pipeline.backends.clip_backend import CLIPBackend
            CLIPBackend._clip_model = None
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


# ─────────────────────────────────────────────
# Unified model status endpoint
# ─────────────────────────────────────────────

@router.get("/status", response_model=UnifiedModelStatus)
async def get_unified_model_status(db: AsyncSession = Depends(get_db)):
    """Return download status for all local pipeline model categories."""
    settings = get_settings()
    categories: list[ModelCategoryStatus] = []

    # Speech-to-Text (Whisper)
    whisper_models = []
    default_whisper = await config_service.get_config_raw(db, "local_whisper_model") or "base"
    for hf_id, cli_name in WHISPER_MODEL_MAP.items():
        downloaded = _model_is_downloaded(cli_name)
        size = None
        if downloaded:
            whisper = _whisper_dir()
            for candidate in [
                whisper / f"faster-whisper-{cli_name}",
                whisper / f"models--Systran--faster-whisper-{cli_name}",
            ]:
                s = _dir_size_str(candidate)
                if s:
                    size = s
                    break
        whisper_models.append(ModelStatusItem(
            model_id=cli_name, name=f"Whisper {cli_name}",
            downloaded=downloaded, disk_size=size,
            estimated_size=_WHISPER_ESTIMATED_SIZES.get(cli_name),
            is_default=cli_name == default_whisper,
        ))
    categories.append(ModelCategoryStatus(
        category="whisper", display_name="Speech-to-Text",
        icon="mic", models=whisper_models,
        total_disk_size=_dir_size_str(_whisper_dir()),
    ))

    # PDF Extraction (Marker)
    marker_downloaded = _marker_is_downloaded()
    # Detect in-progress download: marker dir exists but no model files yet
    marker_dir = Path(settings.models_root) / MARKER_SUBDIR
    marker_downloading = (
        not marker_downloaded
        and marker_dir.exists()
        and any(marker_dir.iterdir())
    )
    categories.append(ModelCategoryStatus(
        category="marker", display_name="PDF Extraction",
        icon="file-text", models=[
            ModelStatusItem(
                model_id="marker", name="Marker PDF",
                downloaded=marker_downloaded,
                downloading=marker_downloading,
                disk_size=_marker_disk_size() if marker_downloaded else None,
                estimated_size=_MARKER_ESTIMATED_SIZE,
                is_default=True,
            )
        ],
        total_disk_size=_marker_disk_size() if marker_downloaded else None,
    ))

    # Document Analysis (Docling)
    docling_downloaded = _docling_is_downloaded()
    categories.append(ModelCategoryStatus(
        category="docling", display_name="Document Analysis (Docling)",
        icon="file-text", models=[
            ModelStatusItem(
                model_id="docling", name="Docling Models",
                downloaded=docling_downloaded,
                disk_size=_docling_disk_size() if docling_downloaded else None,
                estimated_size="~1.5 GB",
                is_default=True,
            )
        ],
        total_disk_size=_docling_disk_size() if docling_downloaded else None,
    ))

    # CLIP
    clip_models = []
    clip_ids = ["clip-ViT-B-32", "clip-ViT-B-16", "clip-ViT-L-14"]
    default_clip = await config_service.get_config_raw(db, "clip_model") or "clip-ViT-B-32"
    for cid in clip_ids:
        downloaded = _clip_is_downloaded(cid)
        clip_models.append(ModelStatusItem(
            model_id=cid, name=cid,
            downloaded=downloaded,
            disk_size=_clip_disk_size(cid) if downloaded else None,
            estimated_size=_CLIP_ESTIMATED_SIZES.get(cid),
            is_default=cid == default_clip,
        ))
    categories.append(ModelCategoryStatus(
        category="clip", display_name="Vision / CLIP",
        icon="image", models=clip_models,
        total_disk_size=_dir_size_str(Path(settings.models_root) / CLIP_SUBDIR),
    ))

    # Embeddings
    embedding_models_info = [
        ("all-MiniLM-L6-v2", "all-MiniLM-L6-v2", "~90 MB"),
        ("bge-small-en-v1.5", "BAAI/bge-small-en-v1.5", "~130 MB"),
        ("bge-base-en-v1.5", "BAAI/bge-base-en-v1.5", "~440 MB"),
        ("all-mpnet-base-v2", "all-mpnet-base-v2", "~420 MB"),
        ("e5-small-v2", "intfloat/e5-small-v2", "~130 MB"),
        ("e5-base-v2", "intfloat/e5-base-v2", "~440 MB"),
    ]
    default_emb = await config_service.get_config_raw(db, "embedding_model") or "all-MiniLM-L6-v2"
    emb_models = []
    for emb_id, emb_name, emb_est in embedding_models_info:
        downloaded = _embedding_is_downloaded(emb_id)
        size = None
        if downloaded:
            emb_dir = _embeddings_dir()
            safe = emb_id.replace("/", "--")
            for candidate in [
                emb_dir / f"models--sentence-transformers--{safe}",
                emb_dir / f"models--BAAI--{safe}",
                emb_dir / f"models--intfloat--{safe}",
                emb_dir / f"models--{safe}",
                emb_dir / safe,
            ]:
                s = _dir_size_str(candidate)
                if s:
                    size = s
                    break
        emb_models.append(ModelStatusItem(
            model_id=emb_id, name=emb_name,
            downloaded=downloaded, disk_size=size,
            estimated_size=emb_est,
            is_default=emb_id == default_emb,
        ))
    categories.append(ModelCategoryStatus(
        category="embeddings", display_name="Text Embeddings",
        icon="text", models=emb_models,
        total_disk_size=_dir_size_str(_embeddings_dir()),
    ))

    # TTS (Piper, Coqui, Liquid Audio)
    from openforge.services.local_models import get_local_models_with_status
    tts_catalog = get_local_models_with_status("tts")
    default_tts = await config_service.get_config_raw(db, "system_tts_default") or ""
    tts_models = []
    for m in tts_catalog:
        engine = m.get("engine", "")
        size_mb = m.get("size_mb", 0)
        est = f"~{size_mb} MB" if size_mb < 1000 else f"~{size_mb / 1000:.1f} GB"
        tts_models.append(ModelStatusItem(
            model_id=m["id"], name=m["name"],
            downloaded=m.get("downloaded", False),
            estimated_size=est,
            is_default=m["id"] == default_tts,
        ))
    if tts_models:
        piper_dir = Path(settings.models_root) / "piper"
        categories.append(ModelCategoryStatus(
            category="tts", display_name="Text-to-Speech",
            icon="volume-2", models=tts_models,
            total_disk_size=_dir_size_str(piper_dir),
        ))

    return UnifiedModelStatus(categories=categories)
