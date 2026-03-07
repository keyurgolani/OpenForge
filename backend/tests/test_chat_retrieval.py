from openforge.services.chat_retrieval import (
    build_context_sources,
    select_relevant_rag_results,
)


def test_select_relevant_rag_results_returns_empty_for_low_similarity_hits() -> None:
    rag_results = [
        {"knowledge_id": "a", "title": "A", "chunk_text": "First", "score": 0.41},
        {"knowledge_id": "b", "title": "B", "chunk_text": "Second", "score": 0.38},
    ]

    assert select_relevant_rag_results(rag_results) == []


def test_select_relevant_rag_results_dedupes_and_filters_by_score_gap() -> None:
    rag_results = [
        {"knowledge_id": "knowledge-a", "title": "A1", "chunk_text": "Top", "score": 0.82},
        {"knowledge_id": "knowledge-a", "title": "A2", "chunk_text": "Duplicate knowledge item", "score": 0.80},
        {"knowledge_id": "knowledge-d", "title": "D", "chunk_text": "Close score", "score": 0.81},
        {"knowledge_id": "knowledge-b", "title": "B", "chunk_text": "Relevant", "score": 0.74},
        {"knowledge_id": "knowledge-c", "title": "C", "chunk_text": "Too far", "score": 0.65},
    ]

    filtered = select_relevant_rag_results(rag_results, limit=5)

    assert [r["knowledge_id"] for r in filtered] == ["knowledge-a", "knowledge-d", "knowledge-b"]


def test_build_context_sources_truncates_snippet_and_keeps_score() -> None:
    long_chunk = "x" * 400
    rag_results = [
        {"knowledge_id": "knowledge-a", "title": "Alpha", "chunk_text": long_chunk, "score": 0.78},
    ]

    sources = build_context_sources(rag_results)

    assert len(sources) == 1
    assert sources[0]["knowledge_id"] == "knowledge-a"
    assert sources[0]["title"] == "Alpha"
    assert sources[0]["score"] == 0.78
    assert len(sources[0]["snippet"]) == 200
