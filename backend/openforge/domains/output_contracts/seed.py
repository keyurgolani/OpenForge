"""Deterministic seed data for curated output contracts."""

from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/output-contracts")


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def get_seed_output_contract_blueprints() -> list[dict[str, Any]]:
    """Return deterministic output contract blueprints for the product catalog.

    These 5 curated contracts cover streaming, batch, interactive,
    structured JSON, and citation-required output modes that operators
    can assign to agent profiles out of the box.
    """

    return [
        # ------------------------------------------------------------ 1
        {
            "id": _seed_uuid("output-contract.streaming-text"),
            "name": "Streaming Text",
            "slug": "streaming-text",
            "description": (
                "Default streaming text output."
            ),
            "execution_mode": "streaming",
            "require_structured_output": False,
            "output_schema": None,
            "require_citations": False,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 2
        {
            "id": _seed_uuid("output-contract.batch-processing"),
            "name": "Batch Processing",
            "slug": "batch-processing",
            "description": (
                "Complete responses delivered as a single batch."
            ),
            "execution_mode": "batch",
            "require_structured_output": False,
            "output_schema": None,
            "require_citations": False,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 3
        {
            "id": _seed_uuid("output-contract.interactive-mode"),
            "name": "Interactive Mode",
            "slug": "interactive-mode",
            "description": (
                "Interactive execution with human-in-the-loop checkpoints."
            ),
            "execution_mode": "interactive",
            "require_structured_output": False,
            "output_schema": None,
            "require_citations": False,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 4
        {
            "id": _seed_uuid("output-contract.structured-json"),
            "name": "Structured JSON Output",
            "slug": "structured-json",
            "description": (
                "Enforces JSON-structured responses."
            ),
            "execution_mode": "streaming",
            "require_structured_output": True,
            "output_schema": None,
            "require_citations": False,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 5
        {
            "id": _seed_uuid("output-contract.citation-required"),
            "name": "Citation Required",
            "slug": "citation-required",
            "description": (
                "Requires agents to cite sources in their responses."
            ),
            "execution_mode": "streaming",
            "require_structured_output": False,
            "output_schema": None,
            "require_citations": True,
            "is_system": True,
            "status": "active",
        },
    ]
