from typing import Any


def _score_of(result: dict[str, Any]) -> float:
    score = result.get("score", 0.0)
    try:
        return float(score)
    except (TypeError, ValueError):
        return 0.0


def select_relevant_rag_results(
    rag_results: list[dict[str, Any]],
    limit: int = 5,
    min_score: float = 0.5,
    max_score_gap: float = 0.12,
) -> list[dict[str, Any]]:
    """
    Keep only clearly relevant RAG hits for chat:
    - Require a strong top hit (>= min_score), otherwise return no context.
    - Keep only results close to the top score (within max_score_gap).
    - Deduplicate by note_id to avoid repeated chunks from one note.
    """
    if not rag_results:
        return []

    sorted_results = sorted(rag_results, key=_score_of, reverse=True)
    top_score = _score_of(sorted_results[0])
    if top_score < min_score:
        return []

    score_cutoff = max(min_score, top_score - max_score_gap)

    selected: list[dict[str, Any]] = []
    seen_note_ids: set[str] = set()

    for result in sorted_results:
        note_id = str(result.get("note_id", "")).strip()
        if not note_id or note_id in seen_note_ids:
            continue

        score = _score_of(result)
        if score < score_cutoff:
            continue

        selected.append(result)
        seen_note_ids.add(note_id)
        if len(selected) >= limit:
            break

    return selected


def build_context_sources(rag_results: list[dict[str, Any]], snippet_len: int = 200) -> list[dict[str, Any]]:
    """Map selected RAG results into persisted/displayable source metadata."""
    sources: list[dict[str, Any]] = []
    for result in rag_results:
        chunk_text = str(result.get("chunk_text", ""))
        sources.append(
            {
                "note_id": result.get("note_id"),
                "title": result.get("title") or "",
                "snippet": chunk_text[:snippet_len],
                "score": _score_of(result),
            }
        )
    return sources
