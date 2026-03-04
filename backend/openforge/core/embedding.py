from sentence_transformers import SentenceTransformer
from openforge.config import get_settings
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
