from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from openforge.domains.retrieval.conversation_memory import ConversationMemoryService
from openforge.domains.retrieval.evidence import EvidenceAssembler
from openforge.domains.retrieval.schemas import (
    EvidencePacketBuildRequest,
    RetrievalReadRequest,
    RetrievalSearchRequest,
)
from openforge.domains.retrieval.service import RetrievalService
from openforge.domains.retrieval.tool_output_handling import ToolOutputHandler
from openforge.domains.retrieval.types import (
    RetrievalResultStatus,
    RetrievalSourceType,
    SelectionReasonCode,
    SummaryType,
)
from openforge.domains.retrieval.chunking import build_contextual_chunks


class _FakeDB:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0
        self.refreshed: list[object] = []

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, obj: object) -> None:
        self.refreshed.append(obj)


@pytest.mark.asyncio
async def test_retrieval_search_records_query_and_ranked_results(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    service = RetrievalService(db)
    workspace_id = uuid4()

    monkeypatch.setattr(
        service,
        "_search_candidates",
        lambda request: [
            {
                "source_type": RetrievalSourceType.KNOWLEDGE,
                "source_id": "doc-1",
                "title": "Release Notes",
                "knowledge_type": "note",
                "excerpt": "Testing reliability improved in this release.",
                "header_path": "Changelog > Testing",
                "parent_excerpt": "## Changelog\nTesting reliability improved in this release.",
                "score": 0.91,
                "strategy": "hybrid_rrf",
                "metadata": {"chunk_index": 4},
            },
            {
                "source_type": RetrievalSourceType.CONVERSATION,
                "source_id": "chat-1",
                "title": "Release Retro",
                "knowledge_type": "chat",
                "excerpt": "We agreed the flaky test issue is resolved.",
                "header_path": None,
                "parent_excerpt": None,
                "score": 0.77,
                "strategy": "dense",
                "metadata": {"conversation_id": "chat-1"},
            },
        ],
    )

    response = await service.search(
        RetrievalSearchRequest(
            workspace_id=workspace_id,
            query_text="release testing reliability",
            limit=5,
        )
    )

    assert response.query.workspace_id == workspace_id
    assert response.query.query_text == "release testing reliability"
    assert [result.rank_position for result in response.results] == [1, 2]
    assert response.results[0].source_type == RetrievalSourceType.KNOWLEDGE
    assert response.results[0].result_status == RetrievalResultStatus.CANDIDATE
    assert response.results[1].strategy == "dense"
    assert db.commits == 1
    assert len(db.added) == 3


@pytest.mark.asyncio
async def test_retrieval_read_marks_opened_results_and_preserves_parent_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _FakeDB()
    service = RetrievalService(db)
    query_id = uuid4()
    result_id = uuid4()

    stored_result = SimpleNamespace(
        id=result_id,
        query_id=query_id,
        workspace_id=uuid4(),
        source_type=RetrievalSourceType.KNOWLEDGE.value,
        source_id="doc-1",
        title="Release Notes",
        knowledge_type="note",
        excerpt="Testing reliability improved in this release.",
        header_path="Changelog > Testing",
        parent_excerpt="## Changelog\nTesting reliability improved in this release.",
        score=0.91,
        rank_position=1,
        strategy="hybrid_rrf",
        result_status=RetrievalResultStatus.CANDIDATE.value,
        selected=False,
        opened=False,
        summary_status=None,
        selection_reason_codes=[],
        trust_metadata={},
        metadata_json={},
    )

    async def _load_results(_query_id, _result_ids):
        return [stored_result]

    async def _read_candidates(_stored_results, _request):
        return {
            result_id: {
                "content": "Testing reliability improved in this release.\nThe parent section explains the rollout context.",
                "excerpt": "Testing reliability improved in this release.",
                "parent_excerpt": stored_result.parent_excerpt,
                "citation": {"start": 0, "end": 45},
                "metadata": {"opened_via": "api"},
            }
        }

    monkeypatch.setattr(service, "_load_stored_results", _load_results)
    monkeypatch.setattr(service, "_read_candidates", _read_candidates)

    response = await service.read(
        RetrievalReadRequest(
            query_id=query_id,
            result_ids=[result_id],
            include_parent_context=True,
            selection_reason_codes=[SelectionReasonCode.TOP_RANKED, SelectionReasonCode.PARENT_EXPANSION],
        )
    )

    assert len(response.results) == 1
    opened = response.results[0]
    assert opened.result_id == result_id
    assert opened.opened is True
    assert opened.selected is True
    assert opened.parent_excerpt == "## Changelog\nTesting reliability improved in this release."
    assert opened.selection_reason_codes == [
        SelectionReasonCode.TOP_RANKED,
        SelectionReasonCode.PARENT_EXPANSION,
    ]
    assert stored_result.opened is True
    assert stored_result.selected is True
    assert stored_result.result_status == RetrievalResultStatus.OPENED.value


@pytest.mark.asyncio
async def test_get_latest_conversation_summary_returns_most_recent_version(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    service = RetrievalService(db)
    conversation_id = uuid4()
    workspace_id = uuid4()

    stored = SimpleNamespace(
        id=uuid4(),
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        run_id=None,
        summary_type=SummaryType.CONVERSATION_MEMORY.value,
        version=3,
        summary="Deployment plan locked. Rollback notes still pending.",
        recent_messages_json=[{"role": "user", "content": "What is left?"}],
        metadata_json={"message_count": 14},
        created_at=datetime.now(timezone.utc),
    )

    class _SummaryResult:
        def scalar_one_or_none(self):
            return stored

    async def _execute(_query):
        return _SummaryResult()

    monkeypatch.setattr(db, "execute", _execute, raising=False)

    response = await service.get_latest_conversation_summary(conversation_id=conversation_id)

    assert response is not None
    assert response.summary.version == 3
    assert response.summary.summary == "Deployment plan locked. Rollback notes still pending."
    assert response.summary.recent_messages == [{"role": "user", "content": "What is left?"}]


def test_evidence_packet_assembly_keeps_evidence_separate_from_answers() -> None:
    assembler = EvidenceAssembler()
    packet = assembler.build(
        EvidencePacketBuildRequest(
            workspace_id=uuid4(),
            query_id=uuid4(),
            items=[
                {
                    "source_type": RetrievalSourceType.KNOWLEDGE,
                    "source_id": "doc-1",
                    "title": "Release Notes",
                    "excerpt": "Testing reliability improved in this release and the flaky suite was removed.",
                    "parent_excerpt": "## Changelog\nTesting reliability improved in this release and the flaky suite was removed.",
                    "selection_reason_codes": [SelectionReasonCode.TOP_RANKED],
                    "citation": {"start": 0, "end": 74},
                    "metadata": {"header_path": "Changelog > Testing"},
                }
            ],
            summary="Primary supporting evidence for the testing reliability claim.",
        )
    )

    assert packet.summary == "Primary supporting evidence for the testing reliability claim."
    assert packet.item_count == 1
    assert packet.items[0].selection_reason_codes == [SelectionReasonCode.TOP_RANKED]
    assert "flaky suite was removed" in packet.items[0].excerpt


def test_conversation_memory_summary_keeps_recent_turns_and_decisions() -> None:
    service = ConversationMemoryService()
    conversation_id = uuid4()
    workspace_id = uuid4()
    messages = [
        {"role": "user", "content": "We need to ship the testing reliability fix this Friday."},
        {"role": "assistant", "content": "Agreed. I will prepare the rollout checklist."},
        {"role": "user", "content": "Keep the flaky-suite removal as a separate task."},
        {"role": "assistant", "content": "Noted. I will track that as unresolved follow-up work."},
        {"role": "user", "content": "What is still pending?"},
        {"role": "assistant", "content": "Only the rollback notes and the flaky-suite follow-up remain."},
    ]

    summary = service.build_summary(
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        messages=messages,
        max_messages_before_summary=4,
        keep_recent_messages=2,
    )

    assert summary.summary_type == SummaryType.CONVERSATION_MEMORY
    assert "ship the testing reliability fix this Friday" in summary.summary
    assert "flaky-suite" in summary.summary
    assert len(summary.recent_messages) == 2
    assert summary.recent_messages[0]["content"] == "What is still pending?"


def test_tool_output_handler_summarizes_large_payloads_and_preserves_preview() -> None:
    handler = ToolOutputHandler(max_inline_chars=120, max_preview_chars=60)
    large_output = {
        "results": [
            {"title": "Release Notes", "body": "testing " * 80},
            {"title": "Retro", "body": "follow-up " * 80},
        ]
    }

    processed = handler.process(
        tool_name="workspace.search",
        output=large_output,
    )

    assert processed.was_truncated is True
    assert processed.summary_type == SummaryType.TOOL_OUTPUT
    assert processed.preview
    assert "Release Notes" in processed.summary
    assert processed.raw_char_count > len(processed.preview)


def test_contextual_chunk_builder_filters_navigation_noise_and_keeps_heading_context() -> None:
    content = """
# Handbook

Home
Docs
Contact

## Release Notes

Testing reliability improved in this release.

The rollout checklist now includes explicit rollback notes.
"""

    chunks = build_contextual_chunks(content, title="Handbook", min_chunk_tokens=4, max_chunk_tokens=80)

    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.header_path == "Handbook > Release Notes"
    assert "Testing reliability improved" in chunk.text
    assert "Home\nDocs\nContact" not in chunk.text
    assert "section 'Handbook > Release Notes'" in chunk.contextualized_text
    assert chunk.chunk_type == "child"
    assert chunk.char_end > chunk.char_start
    assert chunk.token_count > 0
