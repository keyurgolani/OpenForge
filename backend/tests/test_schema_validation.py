from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from openforge.schemas.search import SearchParams, SearchResponse, SearchResult
from openforge.schemas.workspace import WorkspaceCreate, WorkspaceResponse


def test_workspace_create_validates_name_and_color():
    with pytest.raises(ValidationError):
        WorkspaceCreate(name="   ")

    with pytest.raises(ValidationError):
        WorkspaceCreate(name="Valid", color="blue")

    ws = WorkspaceCreate(name="  Product Notes  ", color="#2dd4bf")
    assert ws.name == "Product Notes"
    assert ws.color == "#2dd4bf"


def test_workspace_response_and_search_models_roundtrip():
    now = datetime.now(timezone.utc)
    workspace_id = uuid4()

    response = WorkspaceResponse(
        id=workspace_id,
        name="Workspace",
        description=None,
        icon=None,
        color="#112233",
        llm_provider_id=None,
        llm_model=None,
        sort_order=1,
        knowledge_count=4,
        conversation_count=2,
        created_at=now,
        updated_at=now,
    )
    assert response.id == workspace_id
    assert response.knowledge_count == 4

    params = SearchParams(q="testing", mode="chat", knowledge_type="bookmark", tag="ai", limit=5)
    assert params.mode == "chat"
    assert params.limit == 5

    result = SearchResult(
        knowledge_id=uuid4(),
        title="Doc",
        knowledge_type="note",
        chunk_text="Snippet",
        score=0.91,
    )
    payload = SearchResponse(results=[result], query="testing", total=1)
    assert payload.total == 1
    assert payload.results[0].title == "Doc"
