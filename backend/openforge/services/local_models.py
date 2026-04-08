"""OpenForge Local unified provider — local models catalog and seed logic."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

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
    LocalModel(id="openai/whisper-tiny", name="Whisper Tiny", capability_type="stt", size_mb=75),
    LocalModel(id="openai/whisper-base", name="Whisper Base", capability_type="stt", size_mb=145),
    LocalModel(id="openai/whisper-small", name="Whisper Small", capability_type="stt", size_mb=460),
    LocalModel(id="openai/whisper-medium", name="Whisper Medium", capability_type="stt", size_mb=1500),
    LocalModel(id="openai/whisper-large-v2", name="Whisper Large v2", capability_type="stt", size_mb=3100, requires_gpu=True),
    LocalModel(id="openai/whisper-large-v3", name="Whisper Large v3", capability_type="stt", size_mb=3100, requires_gpu=True),

    # ── TTS / Piper ──
    LocalModel(id="piper-en-us-amy", name="Piper EN-US Amy", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-en-us-lessac", name="Piper EN-US Lessac", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-en-gb-alba", name="Piper EN-GB Alba", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-de-thorsten", name="Piper DE Thorsten", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-fr-siwis", name="Piper FR Siwis", capability_type="tts", engine="piper", size_mb=30),
    LocalModel(id="piper-es-mls", name="Piper ES MLS", capability_type="tts", engine="piper", size_mb=30),

    # ── TTS / Coqui ──
    LocalModel(id="xtts-v2", name="XTTS v2", capability_type="tts", engine="coqui", size_mb=1800, requires_gpu=True),

    # ── STT+TTS / Liquid AI ──
    LocalModel(id="lfm2.5-audio-1.5b-stt", name="LFM2.5 Audio 1.5B", capability_type="stt", engine="liquid-audio", size_mb=6000),
    LocalModel(id="lfm2.5-audio-1.5b-tts", name="LFM2.5 Audio 1.5B", capability_type="tts", engine="liquid-audio", size_mb=6000),

    # ── Embedding ──
    LocalModel(id="all-MiniLM-L6-v2", name="all-MiniLM-L6-v2", capability_type="embedding", size_mb=80),
    LocalModel(id="all-MiniLM-L12-v2", name="all-MiniLM-L12-v2", capability_type="embedding", size_mb=120),
    LocalModel(id="BAAI/bge-small-en-v1.5", name="BGE Small EN v1.5", capability_type="embedding", size_mb=130),
    LocalModel(id="intfloat/e5-small-v2", name="E5 Small v2", capability_type="embedding", size_mb=130),
    LocalModel(id="BAAI/bge-base-en-v1.5", name="BGE Base EN v1.5", capability_type="embedding", size_mb=440),
    LocalModel(id="all-mpnet-base-v2", name="all-mpnet-base-v2", capability_type="embedding", size_mb=420),
    LocalModel(id="nomic-ai/nomic-embed-text-v1", name="Nomic Embed Text v1", capability_type="embedding", size_mb=540),
    LocalModel(id="intfloat/e5-base-v2", name="E5 Base v2", capability_type="embedding", size_mb=440),
    LocalModel(id="thenlper/gte-base", name="GTE Base", capability_type="embedding", size_mb=440),
    LocalModel(id="BAAI/bge-large-en-v1.5", name="BGE Large EN v1.5", capability_type="embedding", size_mb=1300, requires_gpu=True),
    LocalModel(id="intfloat/e5-large-v2", name="E5 Large v2", capability_type="embedding", size_mb=1300, requires_gpu=True),

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
        # Whisper models: id is "openai/whisper-<size>", file is "<size>.pt"
        whisper_name = model.id.split("/")[-1].replace("whisper-", "")
        whisper_dir = root / "whisper"
        # faster-whisper: check for CTranslate2 model directory
        ct2_dir = whisper_dir / f"faster-whisper-{whisper_name}"
        pt_file = whisper_dir / f"{whisper_name}.pt"
        return ct2_dir.exists() or pt_file.exists()

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

    if model.engine == "liquid-audio":
        liquid_dir = root / "liquid-audio"
        if not liquid_dir.exists():
            return False
        return any(liquid_dir.rglob("*.safetensors")) or any(liquid_dir.rglob("*.bin"))

    return False


def get_local_models_with_status(capability_type: str | None = None) -> list[dict]:
    """Return models catalog with a `downloaded` field appended to each entry."""
    models = list_local_models(capability_type)
    for m in models:
        m["downloaded"] = get_download_status(m["id"])
    return models


# ── Ollama integration ──────────────────────────────────────────────────────

# Known Ollama embedding model family prefixes.
# Models whose name starts with any of these are classified as embedding.
OLLAMA_EMBEDDING_FAMILIES: tuple[str, ...] = (
    "nomic-embed-text",
    "mxbai-embed-large",
    "all-minilm",
    "snowflake-arctic-embed",
    "bge-m3",
    "bge-large",
)


def get_ollama_url() -> str:
    """Return the Ollama base URL from settings, stripped of trailing slashes."""
    return get_settings().ollama_url.rstrip("/")


def _is_ollama_embedding_model(model_name: str) -> bool:
    """Return True if *model_name* belongs to a known embedding family."""
    name_lower = model_name.lower().split(":")[0]  # strip tag
    return any(name_lower.startswith(prefix) for prefix in OLLAMA_EMBEDDING_FAMILIES)


async def fetch_ollama_models() -> list[dict]:
    """Fetch models from Ollama ``/api/tags`` and return them in catalog format.

    Each returned dict has the same shape as ``_model_to_dict`` output:
    ``id``, ``name``, ``capability_type``, ``engine``, ``size_mb``,
    ``requires_gpu``, ``downloaded`` (always ``True`` for installed Ollama
    models), and ``source`` (``"ollama"``).

    ``capability_type`` is inferred: embedding models are detected via
    ``OLLAMA_EMBEDDING_FAMILIES``; everything else is classified as ``chat``.
    """
    base_url = get_ollama_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            resp.raise_for_status()
    except Exception:
        logger.warning("Could not reach Ollama at %s — returning empty model list", base_url)
        return []

    models: list[dict] = []
    for m in resp.json().get("models", []):
        name: str = m.get("name", "")
        size_bytes: int = m.get("size", 0)
        size_mb = round(size_bytes / (1024 * 1024))

        cap = "embedding" if _is_ollama_embedding_model(name) else "chat"

        models.append({
            "id": name,
            "name": name,
            "capability_type": cap,
            "engine": "ollama",
            "size_mb": size_mb,
            "requires_gpu": False,
            "downloaded": True,
            "source": "ollama",
        })

    return models


def is_ollama_model(model_id: str) -> bool:
    """Return ``True`` if *model_id* is **not** in the local catalog.

    Any model that isn't part of ``LOCAL_MODELS`` is assumed to be served
    by Ollama (chat, vision, or Ollama-native embedding).
    """
    return model_id not in _MODEL_BY_ID


async def get_unified_models(capability_type: str | None = None) -> list[dict]:
    """Merge Ollama models with the local catalog and return the unified list.

    If *capability_type* is given, only models matching that type are returned.
    Local catalog models include a ``downloaded`` status; Ollama models are
    always marked ``downloaded=True`` (they are already pulled).
    """
    # Local catalog with download status
    local = get_local_models_with_status(capability_type)
    for entry in local:
        entry.setdefault("source", "local")

    # Ollama models (async fetch, gracefully empty on failure)
    ollama = await fetch_ollama_models()
    if capability_type:
        ollama = [m for m in ollama if m["capability_type"] == capability_type]

    return ollama + local


# ── Seed / ensure system provider ───────────────────────────────────────────

async def ensure_local_provider(db) -> None:
    """Ensure the 'openforge-local' system provider exists in the database.

    The unified local provider now handles chat (via Ollama) as well as
    STT/TTS/embedding/CLIP/PDF, so it *can* be the system default.
    The provider's ``base_url`` is kept in sync with ``settings.ollama_url``
    so that gateway routing can reach Ollama.
    """
    from sqlalchemy import select
    from openforge.db.models import LLMProvider

    settings = get_settings()

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
            base_url=settings.ollama_url,
            is_system=True,
            is_system_default=False,
            enabled_models=[],
        )
        db.add(provider)
        logger.info("Created system provider: OpenForge Local (%s)", LOCAL_PROVIDER_ID)
    else:
        if not provider.is_system:
            provider.is_system = True
        # Keep base_url in sync with the configured Ollama URL
        if provider.base_url != settings.ollama_url:
            provider.base_url = settings.ollama_url
            logger.info("Updated openforge-local base_url to %s", settings.ollama_url)

    await db.flush()
    await db.commit()
