from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional, Literal
from openforge.db.postgres import get_db
from openforge.core.search_engine import search_engine
from openforge.domains.retrieval.schemas import RetrievalSearchRequest
from openforge.domains.retrieval.service import RetrievalService
from openforge.common.text import highlight_query_terms
from openforge.schemas.search import SearchResponse, SearchResult

router = APIRouter()


@router.get("/{workspace_id}/search", response_model=SearchResponse)
async def search(
    workspace_id: UUID,
    q: str,
    mode: Literal["search", "chat"] = "search",
    knowledge_type: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 20,
    expand_context: bool = False,
    db: AsyncSession = Depends(get_db),
):
    retrieval = await RetrievalService(db, search_backend=search_engine).search(
        RetrievalSearchRequest(
            workspace_id=workspace_id,
            query_text=q,
            knowledge_type=knowledge_type,
            tag=tag,
            limit=limit,
            include_parent_context=expand_context,
            deduplicate_sources=True,
            metadata={"mode": mode},
        )
    )

    results = []
    for r in retrieval.results:
        highlighted = highlight_query_terms(r.excerpt, q)
        results.append(SearchResult(
            retrieval_result_id=r.id,
            knowledge_id=UUID(r.metadata["knowledge_id"]) if r.metadata.get("knowledge_id") else None,
            conversation_id=UUID(r.metadata["conversation_id"]) if r.metadata.get("conversation_id") else None,
            title=r.title,
            knowledge_type=r.knowledge_type or "note",
            chunk_text=r.excerpt,
            header_path=r.header_path,
            parent_chunk_text=r.parent_excerpt,
            tags=r.metadata.get("tags", []),
            score=r.score,
            source_type=r.source_type.value,
            strategy=r.strategy,
            rank_position=r.rank_position,
            result_status=r.result_status.value,
            opened=r.opened,
            selected=r.selected,
            selection_reason_codes=[code.value for code in r.selection_reason_codes],
            created_at=r.metadata.get("created_at"),
            highlighted_text=highlighted,
        ))

    return SearchResponse(
        results=results,
        query=q,
        total=len(results),
        retrieval_query_id=retrieval.query.id,
    )
