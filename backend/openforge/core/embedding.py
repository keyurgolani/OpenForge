from pathlib import Path
from sentence_transformers import SentenceTransformer
from openforge.config import get_settings
from collections import Counter
import re
import zlib
import logging

logger = logging.getLogger("openforge.embedding")

_model: SentenceTransformer | None = None
_model_id: str | None = None


def _embeddings_cache_dir() -> str:
    """Return the embedding model cache directory."""
    settings = get_settings()
    return str(Path(settings.models_root) / "embeddings")


def _resolve_embedding_model_id() -> str:
    """Resolve the active embedding model — DB config overrides env default."""
    from openforge.config import get_settings
    settings = get_settings()
    try:
        from openforge.services.config_service import config_service as _cs
        import asyncio

        async def _read():
            from openforge.db.postgres import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                cfg = await _cs.get_config(db, "embedding_model")
                if cfg and cfg.value:
                    val = cfg.value
                    if isinstance(val, dict):
                        val = val.get("value", "")
                    if val:
                        return str(val)
            return None

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # Can't await in sync context with running loop — use env default
            return settings.embedding_model

        result = asyncio.run(_read())
        if result:
            return result
    except Exception:
        pass
    return settings.embedding_model


def get_embedding_model() -> SentenceTransformer:
    global _model, _model_id
    resolved_id = _resolve_embedding_model_id()
    if _model is None or _model_id != resolved_id:
        cache_dir = _embeddings_cache_dir()
        logger.info(f"Loading embedding model: {resolved_id} from {cache_dir}")
        _model = SentenceTransformer(resolved_id, cache_folder=cache_dir)
        _model_id = resolved_id
        dim = _model.get_sentence_embedding_dimension()
        logger.info(f"Embedding model loaded. Dimension: {dim}")
    return _model


def embed_text(text: str) -> list[float]:
    """Embed a single text string. Returns a list of floats."""
    model = get_embedding_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in a batch."""
    model = get_embedding_model()
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return embeddings.tolist()


def sparse_encode(text: str) -> tuple[list[int], list[float]]:
    """BM25-style sparse encoding for keyword matching.

    Tokenizes text into lowercase words, counts term frequencies, and maps
    each token to a stable non-negative CRC32-based index.
    Returns (indices, values) suitable for Qdrant SparseVector.
    """
    tokens = re.findall(r'\b\w+\b', text.lower())
    if not tokens:
        return [], []
    token_counts = Counter(tokens)
    indices = [zlib.crc32(tok.encode()) & 0x7FFFFFFF for tok in token_counts]
    values = [float(v) for v in token_counts.values()]
    return indices, values
