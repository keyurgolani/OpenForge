"""Compiled agent specification model.

Fully resolved, immutable agent configuration for runtime consumption.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CompiledAgentSpec(BaseModel):
    """Fully resolved, immutable agent configuration for runtime."""

    agent_id: UUID
    agent_slug: str
    name: str
    version: str

    profile_id: UUID

    # Resolved model
    provider_name: Optional[str] = None
    model_name: Optional[str] = None
    allow_model_override: bool = True
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

    # Resolved tools
    tools_enabled: bool = True
    allowed_tool_categories: Optional[list[str]] = None
    blocked_tool_ids: list[str] = Field(default_factory=list)
    confirm_before_tools: list[str] = Field(default_factory=list)

    # Resolved memory
    history_limit: int = 20
    history_strategy: str = "sliding_window"
    attachment_support: bool = True

    # Resolved retrieval (agents can query ALL workspaces)
    retrieval_enabled: bool = True
    retrieval_limit: int = 5
    retrieval_score_threshold: float = 0.35

    # Resolved output
    execution_mode: str = "streaming"
    require_structured_output: bool = False
    output_schema: Optional[dict] = None

    # System prompt + constraints
    system_prompt: str = ""
    constraints: list[str] = Field(default_factory=list)

    # Strategy
    strategy: str = "chat"
    mode: str = "interactive"

    # Metadata
    source_md_hash: str = ""
    compiler_version: str = "1.0.0"
