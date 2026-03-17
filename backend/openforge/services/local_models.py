"""OpenForge Local unified provider — local models catalog and seed logic."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from openforge.common.config import get_settings

logger = logging.getLogger("openforge.services.local_models")

# ── Deterministic provider identity ─────────────────────────────────────────
LOCAL_PROVIDER_ID = uuid.uuid5(uuid.NAMESPACE_URL, "https://openforge.dev/providers/openforge-local")
LOCAL_PROVIDER_NAME = "openforge-local"


# ── Model catalog definition ────────────────────────────────────────────────
@dataclass
class LocalModel:
    id: str
    name: str
    capability_type: str  # stt | tts | embedding | clip | pdf
    size_mb: int
    requires_gpu: bool = False
    engine: Optional[str] = None  # For TTS: "piper" or "coqui"; None for others


LOCAL_MODELS: list[LocalModel] = [
    # ── STT / Whisper ──
    LocalModel(id="whisper-tiny", name="Whisper Tiny", capability_type="stt", size_mb=75),
    LocalModel(id="whisper-base", name="Whisper Base", capability_type="stt", size_mb=150),
    LocalModel(id="whisper-small", name="Whisper Small", capability_type="stt", size_mb=500),
    LocalModel(id="whisper-medium", name="Whisper Medium", capability_type="stt", size_mb=1500),
    LocalModel(id="whisper-large-v2", name="Whisper Large v2", capability_type="stt", size_mb=3000),
    LocalModel(id="whisper-large-v3", name="Whisper Large v3", capability_type="stt", size_mb=3000),

    # ── TTS / Piper ──
    LocalModel(id="piper-en-us-amy", name="Piper EN-US Amy", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-en-us-lessac", name="Piper EN-US Lessac", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-en-gb-alba", name="Piper EN-GB Alba", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-de-thorsten", name="Piper DE Thorsten", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-fr-siwis", name="Piper FR Siwis", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-es-mls", name="Piper ES MLS", capability_type="tts", engine="piper", size_mb=30),

    # ── TTS / Coqui ──
    LocalModel(id="xtts-v2", name="XTTS v2", capability_type="tts", engine="coqui", size_mb=1800, requires_gpu=True),

    # ── Embedding ──
    LocalModel(id="all-MiniLM-L6-v2", name="all-MiniLM-L6-v2", capability_type="embedding", size_mb=25),
    LocalModel(id="all-mpnet-base-v2", name="all-mpnet-base-v2", capability_type="embedding", size_mb=420),
    LocalModel(id="BAAI/bge-small-en-v1.5", name="BGE Small EN v1.5", capability_type="embedding", size_mb=130),
    LocalModel(id="BAAI/bge-base-en-v1.5", name="BGE Base EN v1.5", capability_type="embedding", size_mb=420),

    # ── CLIP ──
    LocalModel(id="clip-ViT-B-16", name="CLIP ViT-B/16", capability_type="clip", size_mb=600),
    LocalModel(id="clip-ViT-B-32", name="CLIP ViT-B/32", capability_type="clip", size_mb=350),
    LocalModel(id="clip-ViT-L-14", name="CLIP ViT-L/14", capability_type="clip", size_mb=1500, requires_gpu=True),

    # ── PDF ──
    LocalModel(id="marker-v1", name="Marker v1", capability_type="pdf", size_mb=1000),
]

# Quick lookup by ID
_MODEL_BY_ID: dict[str, LocalModel] = {m.id: m for m in LOCAL_MODELS}

# Filesystem directories per capability type
_DIR_MAP: dict[str, str] = {
    "stt": "whisper",
    "tts:piper": "piper",
    "tts:coqui": "coqui",
    "embedding": "embeddings",
    "clip": "clip",
    "pdf": "marker",
}


def _models_root() -> Path:
    return Path(get_settings().models_root)


def _model_to_dict(model: LocalModel) -> dict:
    return {
        "id": model.id,
        "name": model.name,
        "capability_type": model.capability_type,
        "engine": model.engine,
        "size_mb": model.size_mb,
        "requires_gpu": model.requires_gpu,
    }


# ── Public API ───────────────────────────────────────────────────────────────

def list_local_models(capability_type: str | None = None) -> list[dict]:
    """Return the models catalog, optionally filtered by capability_type."""
    models = LOCAL_MODELS
    if capability_type:
        models = [m for m in models if m.capability_type == capability_type]
    return [_model_to_dict(m) for m in models]


def get_download_status(model_id: str) -> bool:
    """Check whether a model's files exist on disk."""
    model = _MODEL_BY_ID.get(model_id)
    if not model:
        return False

    root = _models_root()

    if model.capability_type == "stt":
        # Whisper models are stored as <name>.pt (strip "whisper-" prefix for file name)
        whisper_name = model.id.replace("whisper-", "")
        whisper_dir = root / "whisper"
        return (whisper_dir / f"{whisper_name}.pt").exists()

    if model.capability_type == "tts":
        if model.engine == "piper":
            piper_dir = root / "piper"
            if not piper_dir.exists():
                return False
            # Piper models are stored as <model_id>.onnx or in a subdirectory
            return (piper_dir / f"{model.id}.onnx").exists() or (piper_dir / model.id).exists()
        if model.engine == "coqui":
            coqui_dir = root / "coqui"
            if not coqui_dir.exists():
                return False
            return (coqui_dir / model.id).exists()

    if model.capability_type == "embedding":
        emb_dir = root / "embeddings"
        if not emb_dir.exists():
            return False
        safe_name = model.id.replace("/", "--")
        # HuggingFace cache pattern: models--<org>--<name> or models--sentence-transformers--<name>
        for candidate in [
            emb_dir / f"models--{safe_name}",
            emb_dir / f"models--sentence-transformers--{safe_name}",
            emb_dir / safe_name,
        ]:
            if candidate.exists() and any(candidate.rglob("config.json")):
                return True
        return False

    if model.capability_type == "clip":
        clip_dir = root / "clip"
        if not clip_dir.exists():
            return False
        safe_name = model.id.replace("/", "--")
        model_cache = clip_dir / f"models--sentence-transformers--{safe_name}"
        if model_cache.exists() and any(model_cache.rglob("config.json")):
            return True
        alt = clip_dir / safe_name
        if alt.exists() and any(alt.rglob("config.json")):
            return True
        return False

    if model.capability_type == "pdf":
        marker_dir = root / "marker"
        if not marker_dir.exists():
            return False
        # Check for any weight files
        for ext in ("*.safetensors", "*.bin", "*.pt"):
            for p in marker_dir.rglob(ext):
                if p.name != "training_args.bin":
                    return True
        return False

    return False


def get_local_models_with_status(capability_type: str | None = None) -> list[dict]:
    """Return models catalog with a `downloaded` field appended to each entry."""
    models = list_local_models(capability_type)
    for m in models:
        m["downloaded"] = get_download_status(m["id"])
    return models


# ── Seed / ensure system provider ───────────────────────────────────────────

async def ensure_local_provider(db) -> None:
    """Ensure the 'openforge-local' system provider exists in the database."""
    from sqlalchemy import select
    from openforge.db.models import LLMProvider

    result = await db.execute(
        select(LLMProvider).where(LLMProvider.provider_name == LOCAL_PROVIDER_NAME)
    )
    provider = result.scalar_one_or_none()

    if provider is None:
        provider = LLMProvider(
            id=LOCAL_PROVIDER_ID,
            provider_name=LOCAL_PROVIDER_NAME,
            display_name="OpenForge Local",
            endpoint_id="local",
            is_system=True,
            enabled_models=[],
        )
        db.add(provider)
        logger.info("Created system provider: OpenForge Local (%s)", LOCAL_PROVIDER_ID)
    else:
        if not provider.is_system:
            provider.is_system = True
            logger.info("Marked existing openforge-local provider as is_system=True")

    await db.commit()
