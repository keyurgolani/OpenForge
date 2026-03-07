from qdrant_client import QdrantClient, models
from openforge.config import get_settings
import logging

logger = logging.getLogger("openforge.qdrant")

_client: QdrantClient | None = None


def get_qdrant() -> QdrantClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = QdrantClient(url=settings.qdrant_url)
    return _client


async def init_qdrant_collection():
    """Create the knowledge collection if it doesn't exist. Called on app startup."""
    settings = get_settings()
    client = get_qdrant()
    collection_name = settings.qdrant_collection

    collections = client.get_collections().collections
    exists = any(c.name == collection_name for c in collections)

    if not exists:
        logger.info(f"Creating Qdrant collection: {collection_name}")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=settings.embedding_dimension,
                distance=models.Distance.COSINE,
            ),
        )

        # Create payload indexes for filtering
        client.create_payload_index(
            collection_name=collection_name,
            field_name="workspace_id",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=collection_name,
            field_name="knowledge_type",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=collection_name,
            field_name="tags",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=collection_name,
            field_name="knowledge_id",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        logger.info(f"Collection {collection_name} created with payload indexes.")
    else:
        logger.info(f"Qdrant collection {collection_name} already exists.")
