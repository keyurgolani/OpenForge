from openforge.services.chat_retrieval import (
    build_context_sources,
    select_relevant_rag_results,
)


def test_select_relevant_rag_results_returns_empty_for_low_similarity_hits() -> None:
    rag_results = [
        {"note_id": "a", "title": "A", "chunk_text": "First", "score": 0.41},
        {"note_id": "b", "title": "B", "chunk_text": "Second", "score": 0.38},
    ]

    assert select_relevant_rag_results(rag_results) == []


def test_select_relevant_rag_results_dedupes_and_filters_by_score_gap() -> None:
    rag_results = [
        {"note_id": "note-a", "title": "A1", "chunk_text": "Top", "score": 0.82},
        {"note_id": "note-a", "title": "A2", "chunk_text": "Duplicate note", "score": 0.80},
        {"note_id": "note-d", "title": "D", "chunk_text": "Close score", "score": 0.81},
        {"note_id": "note-b", "title": "B", "chunk_text": "Relevant", "score": 0.74},
        {"note_id": "note-c", "title": "C", "chunk_text": "Too far", "score": 0.65},
    ]

    filtered = select_relevant_rag_results(rag_results, limit=5)

    assert [r["note_id"] for r in filtered] == ["note-a", "note-d", "note-b"]


def test_build_context_sources_truncates_snippet_and_keeps_score() -> None:
    long_chunk = "x" * 400
    rag_results = [
        {"note_id": "note-a", "title": "Alpha", "chunk_text": long_chunk, "score": 0.78},
    ]

    sources = build_context_sources(rag_results)

    assert len(sources) == 1
    assert sources[0]["note_id"] == "note-a"
    assert sources[0]["title"] == "Alpha"
    assert sources[0]["score"] == 0.78
    assert len(sources[0]["snippet"]) == 200
