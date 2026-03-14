from datetime import datetime, timezone
from uuid import uuid4

from openforge.schemas.conversation import MessageResponse


def test_message_response_supports_thinking_field() -> None:
    now = datetime.now(timezone.utc)
    response = MessageResponse(
        id=uuid4(),
        conversation_id=uuid4(),
        role="assistant",
        content="Final answer",
        model_used="gpt-oss:20b",
        provider_used="ollama",
        token_count=42,
        generation_ms=1200,
        context_sources=[{"knowledge_id": "n1", "title": "N1", "snippet": "s", "score": 0.9}],
        thinking="step-by-step",
        created_at=now,
    )

    assert response.thinking == "step-by-step"


def test_message_response_supports_attachments_processed_field() -> None:
    now = datetime.now(timezone.utc)
    response = MessageResponse(
        id=uuid4(),
        conversation_id=uuid4(),
        role="user",
        content="See attached file",
        attachments_processed=[
            {
                "id": str(uuid4()),
                "filename": "notes.txt",
                "status": "processed",
                "pipeline": "text",
                "details": "Extracted text (128 chars)",
            }
        ],
        created_at=now,
    )

    assert isinstance(response.attachments_processed, list)
    assert response.attachments_processed[0]["filename"] == "notes.txt"
