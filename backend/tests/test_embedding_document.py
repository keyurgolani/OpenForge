from openforge.core.embedding_document import build_note_embedding_document


def test_build_embedding_document_includes_content_summary_and_intelligence():
    doc = build_note_embedding_document(
        content="Project kickoff notes.",
        ai_summary="Kickoff completed with action items.",
        insights={
            "tasks": ["Prepare roadmap", "Send follow-up"],
            "facts": ["Budget approved"],
            "crucial_things": ["Deadline is Friday"],
            "timelines": [{"date": "2026-03-07", "event": "Roadmap draft"}],
            "tags": ["planning", "project"],
        },
    )

    assert "Project kickoff notes." in doc
    assert "## AI Summary" in doc
    assert "Kickoff completed with action items." in doc
    assert "## AI Intelligence" in doc
    assert "### Tasks" in doc
    assert "- Prepare roadmap" in doc
    assert "### Timelines" in doc
    assert "- 2026-03-07: Roadmap draft" in doc


def test_build_embedding_document_handles_timeline_string_and_empty_values():
    doc = build_note_embedding_document(
        content="",
        ai_summary="",
        insights={
            "timelines": ["Initial release"],
            "tasks": ["", "  "],
        },
    )

    assert "### Timelines" in doc
    assert "- Initial release" in doc
    assert "### Tasks" not in doc


def test_build_embedding_document_ignores_non_list_insight_values():
    doc = build_note_embedding_document(
        content="Base content",
        ai_summary=None,
        insights={"tasks": "not-a-list", "facts": None},
    )

    assert doc == "Base content"
