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


async def init_qdrant_collection() -> bool:
    """Create or migrate the knowledge collection on app startup.

    Returns True if the collection was newly created or migrated (indicating
    that existing knowledge items should be re-indexed in the background).
    """
    settings = get_settings()
    client = get_qdrant()
    collection_name = settings.qdrant_collection

    collections = client.get_collections().collections
    exists = any(c.name == collection_name for c in collections)

    needs_reindex = False

    if exists:
        # Check whether the collection already uses named vectors with sparse support.
        # Old collections used a single unnamed VectorParams; new ones use a dict.
        info = client.get_collection(collection_name)
        vectors_cfg = info.config.params.vectors
        is_named = isinstance(vectors_cfg, dict)
        has_sparse = bool(info.config.params.sparse_vectors)

        if not is_named or not has_sparse:
            logger.info(
                "Migrating Qdrant collection '%s' to named vectors + sparse for hybrid search.",
                collection_name,
            )
            client.delete_collection(collection_name)
            exists = False
            needs_reindex = True
        elif is_named and "summary" not in vectors_cfg:
            # Collection exists with named vectors but lacks the summary vector.
            # Add it non-destructively and trigger re-index to backfill summary vectors.
            logger.info(
                "Adding 'summary' named vector to collection '%s'.",
                collection_name,
            )
            client.update_collection(
                collection_name=collection_name,
                vectors_config={
                    "summary": models.VectorParams(
                        size=settings.embedding_dimension,
                        distance=models.Distance.COSINE,
                    ),
                },
            )
            needs_reindex = True

    if not exists:
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
            },
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(
                    modifier=models.Modifier.IDF,
                ),
            },
        )

        # Payload indexes for filtering
        for field, schema in [
            ("workspace_id", models.PayloadSchemaType.KEYWORD),
            ("knowledge_type", models.PayloadSchemaType.KEYWORD),
            ("tags", models.PayloadSchemaType.KEYWORD),
            ("knowledge_id", models.PayloadSchemaType.KEYWORD),
            ("conversation_id", models.PayloadSchemaType.KEYWORD),
        ]:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field,
                field_schema=schema,
            )

        logger.info("Collection '%s' created with payload indexes.", collection_name)

    return needs_reindex


async def init_memory_collection() -> None:
    """Create the agent memory collection if it doesn't exist."""
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
            ("workspace_id", models.PayloadSchemaType.KEYWORD),
            ("agent_id", models.PayloadSchemaType.KEYWORD),
            ("memory_id", models.PayloadSchemaType.KEYWORD),
            ("memory_type", models.PayloadSchemaType.KEYWORD),
        ]:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field,
                field_schema=schema,
            )

        logger.info("Memory collection '%s' created.", collection_name)


async def init_visual_collection() -> None:
    """Create the CLIP visual search collection if it doesn't exist."""
    settings = get_settings()
    client = get_qdrant()
    collection_name = settings.qdrant_visual_collection

    collections = client.get_collections().collections
    exists = any(c.name == collection_name for c in collections)

    if not exists:
        logger.info("Creating CLIP visual collection: %s", collection_name)
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=settings.clip_dimension,
                distance=models.Distance.COSINE,
            ),
        )

        for field, schema in [
            ("workspace_id", models.PayloadSchemaType.KEYWORD),
            ("knowledge_id", models.PayloadSchemaType.KEYWORD),
        ]:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field,
                field_schema=schema,
            )

        logger.info("Visual collection '%s' created.", collection_name)
