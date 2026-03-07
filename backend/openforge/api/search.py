from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional, Literal
from openforge.db.postgres import get_db
from openforge.core.search_engine import search_engine
from openforge.utils.text import highlight_query_terms
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
    db: AsyncSession = Depends(get_db),
):
    raw_results = search_engine.search_deduplicated(
        query=q,
        workspace_id=str(workspace_id),
        limit=limit,
        knowledge_type=knowledge_type,
        tag=tag,
    )

    results = []
    for r in raw_results:
        highlighted = highlight_query_terms(r["chunk_text"], q)
        results.append(SearchResult(
            knowledge_id=r["knowledge_id"],
            title=r["title"],
            knowledge_type=r["knowledge_type"],
            chunk_text=r["chunk_text"],
            header_path=r.get("header_path"),
            tags=r.get("tags", []),
            score=r["score"],
            created_at=r.get("created_at"),
            highlighted_text=highlighted,
        ))

    return SearchResponse(results=results, query=q, total=len(results))
