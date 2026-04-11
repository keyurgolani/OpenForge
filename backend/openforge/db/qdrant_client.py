from qdrant_client import QdrantClient, models
from openforge.common.config import get_settings
import logging

logger = logging.getLogger("openforge.qdrant")

_client: QdrantClient | None = None


def get_qdrant() -> QdrantClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = QdrantClient(url=settings.qdrant_url)
    return _client


async def init_qdrant_collection() -> bool:
    """Create the knowledge collection on app startup.

    Pre-release: drops and recreates the collection fresh every time it exists.
    Returns True (always needs reindex since we recreated).
    """
    settings = get_settings()
    client = get_qdrant()
    collection_name = settings.qdrant_collection

    collections = client.get_collections().collections
    exists = any(c.name == collection_name for c in collections)

    if exists:
        logger.info("Dropping existing collection '%s' for fresh creation.", collection_name)
        client.delete_collection(collection_name)

    logger.info("Creating Qdrant collection: %s", collection_name)
    client.create_collection(
        collection_name=collection_name,
        vectors_config={
            "dense": models.VectorParams(
                size=settings.embedding_dimension,
                distance=models.Distance.COSINE,
            ),
            "summary": models.VectorParams(
                size=settings.embedding_dimension,
                distance=models.Distance.COSINE,
            ),
            "clip": models.VectorParams(
                size=settings.clip_dimension,
                distance=models.Distance.COSINE,
            ),
        },
        sparse_vectors_config={
            "sparse": models.SparseVectorParams(
                modifier=models.Modifier.IDF,
            ),
        },
    )

    for field, schema in [
        ("workspace_id", models.PayloadSchemaType.KEYWORD),
        ("knowledge_type", models.PayloadSchemaType.KEYWORD),
        ("tags", models.PayloadSchemaType.KEYWORD),
        ("knowledge_id", models.PayloadSchemaType.KEYWORD),
        ("conversation_id", models.PayloadSchemaType.KEYWORD),
        ("chunk_type", models.PayloadSchemaType.KEYWORD),
    ]:
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field,
            field_schema=schema,
        )

    logger.info(
        "Collection '%s' created with dense + summary + clip vectors and payload indexes.",
        collection_name,
    )
    return True  # Always needs reindex since we recreated


async def init_memory_collection() -> None:
    """Create or update the agent memory collection with payload indexes."""
    settings = get_settings()
    client = get_qdrant()
    collection_name = "openforge_memory"

    collections = client.get_collections().collections
    exists = any(c.name == collection_name for c in collections)

    if not exists:
        logger.info("Creating agent memory collection: %s", collection_name)
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=settings.embedding_dimension,
                distance=models.Distance.COSINE,
            ),
        )

    for field, schema in [
        ("memory_id", models.PayloadSchemaType.KEYWORD),
        ("memory_type", models.PayloadSchemaType.KEYWORD),
        ("tier", models.PayloadSchemaType.KEYWORD),
        ("workspace_id", models.PayloadSchemaType.KEYWORD),
        ("agent_id", models.PayloadSchemaType.KEYWORD),
        ("tags", models.PayloadSchemaType.KEYWORD),
        ("invalidated", models.PayloadSchemaType.BOOL),
    ]:
        try:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field,
                field_schema=schema,
            )
        except Exception:
            pass  # Index already exists
