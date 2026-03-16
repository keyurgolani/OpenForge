"""Deterministic seed data for curated memory policies."""

from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/memory-policies")


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def get_seed_memory_policy_blueprints() -> list[dict[str, Any]]:
    """Return deterministic memory policy blueprints for the product catalog.

    These 6 curated policies cover full-context, standard, short-context,
    minimal, research, and coordination memory configurations that operators
    can assign to agent profiles out of the box.
    """

    return [
        # ------------------------------------------------------------ 1
        {
            "id": _seed_uuid("memory-policy.full-context"),
            "name": "Full Context",
            "slug": "full-context",
            "description": (
                "Extended conversation memory for deep research and "
                "multi-turn analysis."
            ),
            "history_limit": 50,
            "history_strategy": "sliding_window",
            "attachment_support": True,
            "auto_bookmark_urls": True,
            "mention_support": True,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 2
        {
            "id": _seed_uuid("memory-policy.standard-chat"),
            "name": "Standard Chat",
            "slug": "standard-chat",
            "description": (
                "Balanced memory policy suitable for most conversational "
                "interactions."
            ),
            "history_limit": 20,
            "history_strategy": "sliding_window",
            "attachment_support": True,
            "auto_bookmark_urls": True,
            "mention_support": True,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 3
        {
            "id": _seed_uuid("memory-policy.short-context"),
            "name": "Short Context",
            "slug": "short-context",
            "description": (
                "Compact memory window for focused, fast tasks."
            ),
            "history_limit": 8,
            "history_strategy": "sliding_window",
            "attachment_support": True,
            "auto_bookmark_urls": True,
            "mention_support": True,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 4
        {
            "id": _seed_uuid("memory-policy.minimal"),
            "name": "Minimal",
            "slug": "minimal",
            "description": (
                "Stripped-down memory with no attachment, URL, or "
                "mention support."
            ),
            "history_limit": 5,
            "history_strategy": "truncate",
            "attachment_support": False,
            "auto_bookmark_urls": False,
            "mention_support": False,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 5
        {
            "id": _seed_uuid("memory-policy.research-mode"),
            "name": "Research Mode",
            "slug": "research-mode",
            "description": (
                "Extended memory for iterative research sessions."
            ),
            "history_limit": 40,
            "history_strategy": "sliding_window",
            "attachment_support": True,
            "auto_bookmark_urls": True,
            "mention_support": True,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 6
        {
            "id": _seed_uuid("memory-policy.coordination-memory"),
            "name": "Coordination",
            "slug": "coordination-memory",
            "description": (
                "Optimized for agent coordination and delegation."
            ),
            "history_limit": 12,
            "history_strategy": "sliding_window",
            "attachment_support": False,
            "auto_bookmark_urls": False,
            "mention_support": True,
            "is_system": True,
            "status": "active",
        },
    ]
