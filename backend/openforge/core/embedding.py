from sentence_transformers import SentenceTransformer
from openforge.config import get_settings
from qdrant_client.models import SparseVector
from collections import Counter
import re
import logging

logger = logging.getLogger("openforge.embedding")

_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        settings = get_settings()
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _model = SentenceTransformer(settings.embedding_model)
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


def sparse_encode(text: str) -> SparseVector:
    """
    Simple BM25-style sparse encoding for hybrid search.

    Tokenizes text, counts term frequencies, and maps tokens to integer indices
    using a hash function. Qdrant applies IDF weighting via the modifier.
    """
    # Tokenize: extract word tokens, lowercase
    tokens = re.findall(r'\b\w+\b', text.lower())

    if not tokens:
        return SparseVector(indices=[], values=[])

    # Count term frequencies
    token_counts = Counter(tokens)

    # Map tokens to integer indices (hash-based for consistency)
    # Use consistent hashing to ensure same token always maps to same index
    indices = []
    values = []
    for token, count in token_counts.items():
        # Hash to a positive 32-bit integer
        idx = abs(hash(token)) % (2**31)
        indices.append(idx)
        values.append(float(count))

    return SparseVector(indices=indices, values=values)


def sparse_encode_batch(texts: list[str]) -> list[SparseVector]:
    """Encode multiple texts with sparse vectors."""
    return [sparse_encode(text) for text in texts]
