from uuid import uuid4, UUID
from openforge.core.embedding import embed_texts, sparse_encode_batch
from openforge.core.embedding_document import build_knowledge_embedding_document
from openforge.core.markdown_utils import chunk_markdown
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings
from openforge.utils.title import normalize_knowledge_title
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
import logging
from datetime import datetime, timezone

logger = logging.getLogger("openforge.processor")


class KnowledgeProcessor:
    async def process_knowledge(
        self,
        knowledge_id: UUID,
        workspace_id: UUID,
        content: str,
        knowledge_type: str,
        title: str | None,
        tags: list[str],
        ai_summary: str | None = None,
        insights: dict | None = None,
    ):
        """Full embedding pipeline for a knowledge item with hybrid search support."""
        settings = get_settings()
        client = get_qdrant()
        collection = settings.qdrant_collection

        # Step 1: Delete old vectors
        client.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="knowledge_id", match=MatchValue(value=str(knowledge_id)))]
            ),
        )

        embedding_document = build_knowledge_embedding_document(
            content=content,
            ai_summary=ai_summary,
            insights=insights if isinstance(insights, dict) else None,
        )
        if not embedding_document or len(embedding_document.strip()) < 20:
            logger.info(f"Knowledge {knowledge_id} too short to embed, skipping.")
            return

        # Step 2: Chunk
        chunks = chunk_markdown(embedding_document)
        if not chunks:
            return

        # Step 3: Embed (both dense and sparse for hybrid search)
        texts = [c["text"] for c in chunks]
        dense_embeddings = embed_texts(texts)
        sparse_embeddings = sparse_encode_batch(texts)

        # Step 4: Upsert with named vectors for hybrid search
        now_str = datetime.now(timezone.utc).isoformat()
        normalized_title = normalize_knowledge_title(title) or ""
        points = []
        for i, (chunk, dense_vec, sparse_vec) in enumerate(zip(chunks, dense_embeddings, sparse_embeddings)):
            points.append(PointStruct(
                id=str(uuid4()),
                vector={
                    "": dense_vec,  # Default dense vector (empty string key)
                    "sparse": sparse_vec,  # Sparse vector for BM25
                },
                payload={
                    "knowledge_id": str(knowledge_id),
                    "workspace_id": str(workspace_id),
                    "knowledge_type": knowledge_type,
                    "chunk_index": i,
                    "chunk_text": chunk["text"],
                    "header_path": chunk.get("header_path") or "",
                    "tags": tags,
                    "title": normalized_title,
                    "created_at": now_str,
                    "updated_at": now_str,
                },
            ))

        client.upsert(collection_name=collection, points=points)
        logger.info(f"Embedded knowledge {knowledge_id}: {len(points)} chunks (hybrid: dense+sparse)")

    async def delete_knowledge_vectors(self, knowledge_id: UUID):
        settings = get_settings()
        client = get_qdrant()
        client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=Filter(
                must=[FieldCondition(key="knowledge_id", match=MatchValue(value=str(knowledge_id)))]
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

knowledge_processor = KnowledgeProcessor()
