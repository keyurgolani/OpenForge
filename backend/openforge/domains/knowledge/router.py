"""
Knowledge domain router skeleton.

This router exists so the knowledge domain package matches the final package
shape from Phase 1, but the active knowledge HTTP surface remains in
``openforge.api.knowledge`` for transitional continuity.
"""

from fastapi import APIRouter

router = APIRouter()

__all__ = ["router"]
