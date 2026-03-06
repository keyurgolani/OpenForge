from uuid import uuid4

from openforge.services.chat_stream_registry import ChatStreamRegistry


def test_snapshot_contains_partial_stream_payload() -> None:
    registry = ChatStreamRegistry()
    workspace_id = uuid4()
    conversation_id = uuid4()

    registry.start(workspace_id=workspace_id, conversation_id=conversation_id)
    registry.set_sources(
        conversation_id=conversation_id,
        sources=[{"note_id": "n1", "title": "Source A", "snippet": "Snippet", "score": 0.77}],
    )
    registry.append_thinking(conversation_id=conversation_id, chunk="Plan")
    registry.append_content(conversation_id=conversation_id, chunk="Answer")

    snapshots = registry.snapshots_for_workspace(workspace_id)

    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert snapshot["conversation_id"] == str(conversation_id)
    assert snapshot["data"]["thinking"] == "Plan"
    assert snapshot["data"]["content"] == "Answer"
    assert snapshot["data"]["sources"] == [{"note_id": "n1", "title": "Source A", "snippet": "Snippet", "score": 0.77}]
    assert snapshot["data"]["started_at"]
    assert snapshot["data"]["updated_at"]


def test_finish_removes_stream_from_registry() -> None:
    registry = ChatStreamRegistry()
    workspace_id = uuid4()
    conversation_id = uuid4()

    registry.start(workspace_id=workspace_id, conversation_id=conversation_id)
    assert registry.snapshot_for_conversation(workspace_id, conversation_id) is not None

    registry.finish(conversation_id)

    assert registry.snapshot_for_conversation(workspace_id, conversation_id) is None


def test_snapshot_filters_by_workspace_and_conversation() -> None:
    registry = ChatStreamRegistry()
    workspace_a = uuid4()
    workspace_b = uuid4()
    conversation_a = uuid4()
    conversation_b = uuid4()

    registry.start(workspace_id=workspace_a, conversation_id=conversation_a)
    registry.start(workspace_id=workspace_b, conversation_id=conversation_b)
    registry.append_content(conversation_id=conversation_a, chunk="A")
    registry.append_content(conversation_id=conversation_b, chunk="B")

    snapshots_a = registry.snapshots_for_workspace(workspace_a)
    assert [item["conversation_id"] for item in snapshots_a] == [str(conversation_a)]

    assert registry.snapshot_for_conversation(workspace_a, conversation_a)["data"]["content"] == "A"
    assert registry.snapshot_for_conversation(workspace_a, conversation_b) is None

