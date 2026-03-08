"""Service to embed chat exchanges for future search."""
import logging
from uuid import uuid4, UUID
from datetime import datetime, timezone

logger = logging.getLogger("openforge.chat_embedding")


async def embed_chat_exchange(
    workspace_id: UUID,
    conversation_id: UUID,
    message_id: UUID,
    user_message: str,
    assistant_response: str,
    conversation_title: str = "",
):
    """Embed a Q&A exchange into the knowledge vector store."""
    # Skip short exchanges
    if len(user_message) < 50 or len(assistant_response) < 200:
        return

    try:
        from openforge.core.embedding import embed_texts
        from openforge.db.qdrant_client import get_qdrant
        from openforge.config import get_settings
        from qdrant_client.models import PointStruct

        settings = get_settings()
        combined = f"Q: {user_message}\n\nA: {assistant_response[:500]}"

        # Generate embeddings
        embeddings = embed_texts([combined])
        if not embeddings:
            return

        dense = embeddings[0]

        client = get_qdrant()
        point_id = str(uuid4())

        # Try hybrid embedding if available
        try:
            from openforge.core.embedding_document import get_sparse_vector
            sparse = get_sparse_vector(combined)
            point = PointStruct(
                id=point_id,
                vector={"dense": dense, "sparse": sparse},
                payload={
                    "knowledge_id": None,
                    "conversation_id": str(conversation_id),
                    "message_id": str(message_id),
                    "workspace_id": str(workspace_id),
                    "knowledge_type": "chat",
                    "chunk_text": combined[:800],
                    "title": conversation_title or "Chat Exchange",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            # Fall back to dense only
            point = PointStruct(
                id=point_id,
                vector=dense,
                payload={
                    "knowledge_id": None,
                    "conversation_id": str(conversation_id),
                    "message_id": str(message_id),
                    "workspace_id": str(workspace_id),
                    "knowledge_type": "chat",
                    "chunk_text": combined[:800],
                    "title": conversation_title or "Chat Exchange",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )

        client.upsert(collection_name=settings.qdrant_collection, points=[point])
        logger.info(f"Embedded chat exchange {message_id} for workspace {workspace_id}")

    except Exception as e:
        logger.warning(f"Failed to embed chat exchange: {e}")
