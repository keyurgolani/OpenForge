from uuid import UUID, uuid4
from datetime import datetime, timezone
import logging

from qdrant_client.models import PointStruct, SparseVector

from openforge.core.embedding import embed_text, sparse_encode
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings

logger = logging.getLogger("openforge.chat_embedding")

_MIN_USER_CHARS = 50
_MIN_ASSISTANT_CHARS = 200
_MAX_ASSISTANT_PREVIEW = 500


class ChatEmbeddingService:
    """Embeds significant chat exchanges for discovery through search."""

    async def embed_exchange(
        self,
        conversation_id: UUID,
        workspace_id: UUID,
        user_message: str,
        assistant_response: str,
        conversation_title: str,
        message_id: UUID,
    ) -> None:
        """Embed a user-assistant exchange if it meets minimum quality thresholds.

        Stores the result in the shared Qdrant knowledge collection with
        knowledge_type="chat" so it surfaces alongside knowledge results in search.
        """
        if len(user_message) < _MIN_USER_CHARS or len(assistant_response) < _MIN_ASSISTANT_CHARS:
            logger.debug(
                "Skipping chat embedding (too short): conv=%s user=%dch assistant=%dch",
                conversation_id,
                len(user_message),
                len(assistant_response),
            )
            return

        combined = f"Q: {user_message}\n\nA: {assistant_response[:_MAX_ASSISTANT_PREVIEW]}"

        try:
            dense_vector = embed_text(combined)
            sparse_indices, sparse_values = sparse_encode(combined)
        except Exception as e:
            logger.error("Embedding failed for chat exchange (conv=%s): %s", conversation_id, e)
            return

        vector: dict = {"dense": dense_vector}
        if sparse_indices:
            vector["sparse"] = SparseVector(
                indices=sparse_indices,
                values=sparse_values,
            )

        point = PointStruct(
            id=str(uuid4()),
            vector=vector,
            payload={
                "knowledge_id": None,
                "conversation_id": str(conversation_id),
                "message_id": str(message_id),
                "workspace_id": str(workspace_id),
                "knowledge_type": "chat",
                "chunk_text": combined,
                "title": conversation_title or "Chat",
                "tags": [],
                "header_path": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        settings = get_settings()
        client = get_qdrant()
        try:
            client.upsert(collection_name=settings.qdrant_collection, points=[point])
            logger.info(
                "Embedded chat exchange: conv=%s chars=%d",
                conversation_id,
                len(combined),
            )
        except Exception as e:
            logger.error(
                "Failed to upsert chat embedding (conv=%s): %s", conversation_id, e
            )


chat_embedding_service = ChatEmbeddingService()
