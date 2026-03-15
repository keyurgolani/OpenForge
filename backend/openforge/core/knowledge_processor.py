from uuid import uuid4, uuid5, UUID, NAMESPACE_URL
from openforge.core.embedding import embed_text, embed_texts, sparse_encode
from openforge.core.embedding_document import build_knowledge_embedding_document
from openforge.core.markdown_utils import chunk_markdown_with_parents
from openforge.db.qdrant_client import get_qdrant
from openforge.config import get_settings
from openforge.utils.title import normalize_knowledge_title
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue, SparseVector
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
        """Full embedding pipeline for a knowledge item."""
        settings = get_settings()
        client = get_qdrant()
        collection = settings.qdrant_collection

        # Step 1: Delete old vectors (including any existing summary point)
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

        # Step 2: Chunk with parent-child contextual architecture
        normalized_title = normalize_knowledge_title(title) or ""
        chunks = chunk_markdown_with_parents(embedding_document, title=normalized_title)
        if not chunks:
            return

        # Step 3: Embed using contextualized text for dense (richer semantic signal),
        # original text for sparse encoding (BM25 works better on raw text)
        dense_texts = [c["contextualized_text"] for c in chunks]
        embeddings = embed_texts(dense_texts)

        # Step 4: Upsert chunk points
        now_str = datetime.now(timezone.utc).isoformat()
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            sparse_indices, sparse_values = sparse_encode(chunk["text"])
            vector: dict = {"dense": embedding}
            if sparse_indices:
                vector["sparse"] = SparseVector(
                    indices=sparse_indices,
                    values=sparse_values,
                )
            points.append(PointStruct(
                id=str(uuid4()),
                vector=vector,
                payload={
                    "knowledge_id": str(knowledge_id),
                    "workspace_id": str(workspace_id),
                    "knowledge_type": knowledge_type,
                    "chunk_index": i,
                    "chunk_text": chunk["text"],
                    "header_path": chunk.get("header_path") or "",
                    "parent_chunk_text": chunk.get("parent_text") or "",
                    "chunk_type": chunk.get("chunk_type") or "child",
                    "char_start": chunk.get("char_start"),
                    "char_end": chunk.get("char_end"),
                    "token_count": chunk.get("token_count"),
                    "parent_token_count": chunk.get("parent_token_count"),
                    "contextualized": True,
                    "tags": tags,
                    "title": normalized_title,
                    "created_at": now_str,
                    "updated_at": now_str,
                },
            ))

        # Step 5: Upsert summary point (if AI summary is available)
        summary_text = (ai_summary or "").strip()
        if summary_text and len(summary_text) >= 20:
            try:
                summary_embedding = embed_text(summary_text)
                summary_point_id = str(uuid5(NAMESPACE_URL, f"summary:{knowledge_id}"))
                points.append(PointStruct(
                    id=summary_point_id,
                    vector={"summary": summary_embedding},
                    payload={
                        "knowledge_id": str(knowledge_id),
                        "workspace_id": str(workspace_id),
                        "knowledge_type": knowledge_type,
                        "chunk_index": -1,
                        "chunk_text": summary_text,
                        "header_path": "",
                        "chunk_type": "summary",
                        "char_start": 0,
                        "char_end": len(summary_text),
                        "token_count": len(summary_text.split()),
                        "parent_token_count": len(summary_text.split()),
                        "tags": tags,
                        "title": normalized_title,
                        "created_at": now_str,
                        "updated_at": now_str,
                    },
                ))
            except Exception as e:
                logger.warning(f"Failed to create summary vector for {knowledge_id}: {e}")

        client.upsert(collection_name=collection, points=points)
        logger.info(f"Embedded knowledge {knowledge_id}: {len(points)} points ({len(chunks)} chunks + {'1 summary' if summary_text and len(summary_text) >= 20 else 'no summary'})")

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
