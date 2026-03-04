from uuid import uuid4, UUID
from openforge.core.embedding import embed_texts
from openforge.core.markdown_utils import chunk_markdown
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
import logging
from datetime import datetime, timezone

logger = logging.getLogger("openforge.processor")


class NoteProcessor:
    async def process_note(
        self,
        note_id: UUID,
        workspace_id: UUID,
        content: str,
        note_type: str,
        title: str | None,
        tags: list[str],
    ):
        """Full embedding pipeline for a note."""
        settings = get_settings()
        client = get_qdrant()
        collection = settings.qdrant_collection

        # Step 1: Delete old vectors
        client.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="note_id", match=MatchValue(value=str(note_id)))]
            ),
        )

        if not content or len(content.strip()) < 20:
            logger.info(f"Note {note_id} too short to embed, skipping.")
            return

        # Step 2: Chunk
        chunks = chunk_markdown(content)
        if not chunks:
            return

        # Step 3: Embed
        texts = [c["text"] for c in chunks]
        embeddings = embed_texts(texts)

        # Step 4: Upsert
        now_str = datetime.now(timezone.utc).isoformat()
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            points.append(PointStruct(
                id=str(uuid4()),
                vector=embedding,
                payload={
                    "note_id": str(note_id),
                    "workspace_id": str(workspace_id),
                    "note_type": note_type,
                    "chunk_index": i,
                    "chunk_text": chunk["text"],
                    "header_path": chunk.get("header_path") or "",
                    "tags": tags,
                    "title": title or "Untitled",
                    "created_at": now_str,
                    "updated_at": now_str,
                },
            ))

        client.upsert(collection_name=collection, points=points)
        logger.info(f"Embedded note {note_id}: {len(points)} chunks")

    async def delete_note_vectors(self, note_id: UUID):
        settings = get_settings()
        client = get_qdrant()
        client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=Filter(
                must=[FieldCondition(key="note_id", match=MatchValue(value=str(note_id)))]
            ),
        )

    async def delete_workspace_vectors(self, workspace_id: UUID):
        settings = get_settings()
        client = get_qdrant()
        client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=Filter(
                must=[FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id)))]
            ),
        )


note_processor = NoteProcessor()
