"""Ranking helpers for retrieval candidates."""

from __future__ import annotations

from typing import Any


def rank_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort candidates by score descending and assign rank positions."""
    ranked = sorted(candidates, key=lambda item: item.get("score", 0.0), reverse=True)
    for index, candidate in enumerate(ranked, start=1):
        candidate["rank_position"] = index
    return ranked
