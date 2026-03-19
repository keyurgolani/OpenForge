"""Provider configuration dataclass for strategy runtime."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    """Resolved LLM provider credentials and model for a strategy run."""

    provider_name: str
    api_key: str
    model: str
    base_url: str | None
