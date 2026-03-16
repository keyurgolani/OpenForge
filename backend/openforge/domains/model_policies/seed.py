"""Deterministic seed data for curated model policies."""

from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/model-policies")


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def get_seed_model_policy_blueprints() -> list[dict[str, Any]]:
    """Return deterministic model policy blueprints for the product catalog.

    These 7 curated policies cover permissive, cost-optimized, high-quality,
    provider-preferred, local-only, and budget-constrained model usage
    configurations that operators can assign to agent profiles out of the box.
    """

    return [
        # ------------------------------------------------------------ 1
        {
            "id": _seed_uuid("model-policy.permissive"),
            "name": "Permissive Model Policy",
            "slug": "permissive",
            "description": (
                "Allows any available model with no token restrictions. "
                "Agents can switch models freely at runtime."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": True,
            "allowed_models": [],
            "blocked_models": [],
            "max_tokens_per_request": None,
            "max_tokens_per_day": None,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 2
        {
            "id": _seed_uuid("model-policy.cost-optimized"),
            "name": "Cost-Optimized",
            "slug": "cost-optimized",
            "description": (
                "Enforces conservative token limits to control costs. "
                "Suitable for high-volume, low-complexity tasks."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": True,
            "allowed_models": [],
            "blocked_models": [],
            "max_tokens_per_request": 4096,
            "max_tokens_per_day": 100000,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 3
        {
            "id": _seed_uuid("model-policy.high-quality"),
            "name": "High Quality",
            "slug": "high-quality",
            "description": (
                "Generous token budgets for tasks requiring deep reasoning, "
                "long-form output, or complex analysis."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": True,
            "allowed_models": [],
            "blocked_models": [],
            "max_tokens_per_request": 16384,
            "max_tokens_per_day": 500000,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 4
        {
            "id": _seed_uuid("model-policy.claude-preferred"),
            "name": "Claude Preferred",
            "slug": "claude-preferred",
            "description": (
                "Restricts model selection to Anthropic Claude models. "
                "Runtime override disabled to enforce provider consistency."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": False,
            "allowed_models": [
                "claude-sonnet-4-20250514",
                "claude-haiku-4-20250414",
                "claude-opus-4-20250514",
            ],
            "blocked_models": [],
            "max_tokens_per_request": 8192,
            "max_tokens_per_day": None,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 5
        {
            "id": _seed_uuid("model-policy.openai-preferred"),
            "name": "OpenAI Preferred",
            "slug": "openai-preferred",
            "description": (
                "Restricts model selection to OpenAI models. "
                "Runtime override disabled to enforce provider consistency."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": False,
            "allowed_models": [
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4.1",
                "gpt-4.1-mini",
                "gpt-4.1-nano",
                "o3",
                "o4-mini",
            ],
            "blocked_models": [],
            "max_tokens_per_request": 8192,
            "max_tokens_per_day": None,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 6
        {
            "id": _seed_uuid("model-policy.local-models-only"),
            "name": "Local Models Only",
            "slug": "local-models-only",
            "description": (
                "Intended for deployments using local models via Ollama or "
                "compatible endpoints. No token limits since local inference "
                "has no API cost."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": True,
            "allowed_models": [],
            "blocked_models": [],
            "max_tokens_per_request": None,
            "max_tokens_per_day": None,
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 7
        {
            "id": _seed_uuid("model-policy.token-limited"),
            "name": "Token-Limited Budget",
            "slug": "token-limited",
            "description": (
                "Strict token caps for budget-constrained environments."
            ),
            "default_provider_id": None,
            "default_model": None,
            "allow_runtime_override": True,
            "allowed_models": [],
            "blocked_models": [],
            "max_tokens_per_request": 2048,
            "max_tokens_per_day": 50000,
            "is_system": True,
            "status": "active",
        },
    ]
