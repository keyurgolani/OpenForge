from pathlib import Path
from sentence_transformers import SentenceTransformer
from openforge.config import get_settings
from collections import Counter
import re
import zlib
import logging

logger = logging.getLogger("openforge.embedding")

_model: SentenceTransformer | None = None


def _embeddings_cache_dir() -> str:
    """Return the embedding model cache directory."""
    settings = get_settings()
    return str(Path(settings.models_root) / "embeddings")


def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        settings = get_settings()
        cache_dir = _embeddings_cache_dir()
        logger.info(f"Loading embedding model: {settings.embedding_model} from {cache_dir}")
        _model = SentenceTransformer(settings.embedding_model, cache_folder=cache_dir)
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
