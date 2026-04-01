"""Agent runtime configuration model.

Fully resolved agent configuration for runtime consumption.
Constructed on-the-fly from AgentDefinitionModel structured fields.
"""

from __future__ import annotations

import re
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AgentRuntimeConfig(BaseModel):
    """Fully resolved agent configuration for runtime."""

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

    # Resolved tools — None means all tools allowed (default for new agents);
    # a list means only those tool IDs are available.
    tools_enabled: bool = True
    allowed_tools: Optional[list[str]] = None
    confirm_before_tools: list[str] = Field(default_factory=list)

    # Resolved memory
    history_limit: int = 20
    attachment_support: bool = True
    auto_bookmark_urls: bool = True

    # Resolved output
    execution_mode: str = "streaming"
    require_structured_output: bool = False
    output_schema: Optional[dict] = None

    # System prompt + constraints
    system_prompt: str = ""
    system_prompt_template: str = ""
    constraints: list[str] = Field(default_factory=list)

    # Input schema
    input_schema: list[dict] = Field(default_factory=list)
    is_parameterized: bool = False

    # Output definitions
    output_definitions: list[dict] = Field(default_factory=lambda: [{"key": "output", "type": "text"}])


# Backward compat alias
CompiledAgentSpec = AgentRuntimeConfig


def build_runtime_config(
    agent_id: UUID,
    agent_slug: str,
    name: str,
    version: str | int,
    profile_id: UUID,
    system_prompt: str = "",
    llm_config: dict | None = None,
    tools_config: list[dict] | None = None,
    memory_config: dict | None = None,
    parameters: list[dict] | None = None,
    output_definitions: list[dict] | None = None,
) -> AgentRuntimeConfig:
    """Build AgentRuntimeConfig from structured agent definition fields."""
    llm = llm_config or {}
    tools = tools_config or []
    mem = memory_config or {}
    params = parameters or []
    outputs = output_definitions or [{"key": "output", "type": "text"}]

    # Build tool allowlist and HITL list from tools_config.
    # Empty tools_config → all tools allowed (allowed_tools=None).
    # Non-empty → only listed tools available.
    allowed_tool_names: list[str] | None = None
    if tools:
        allowed_tool_names = [t["name"] for t in tools]
    confirm_before = [t["name"] for t in tools if t.get("mode") == "hitl"]

    # Extract constraints from system_prompt ## Constraints section
    constraints: list[str] = []
    constraints_match = re.search(r"^## Constraints\s*\n((?:- .+\n?)*)", system_prompt, re.MULTILINE)
    if constraints_match:
        constraints = [
            line.lstrip("- ").strip()
            for line in constraints_match.group(1).strip().split("\n")
            if line.strip().startswith("-")
        ]

    return AgentRuntimeConfig(
        agent_id=agent_id,
        agent_slug=agent_slug,
        name=name,
        version=str(version),
        profile_id=profile_id,
        provider_name=llm.get("provider"),
        model_name=llm.get("model"),
        allow_model_override=llm.get("allow_override", True),
        temperature=llm.get("temperature"),
        max_tokens=llm.get("max_tokens"),
        tools_enabled=True,
        allowed_tools=allowed_tool_names,
        confirm_before_tools=confirm_before,
        history_limit=mem.get("history_limit", 20),
        attachment_support=mem.get("attachment_support", True),
        auto_bookmark_urls=mem.get("auto_bookmark_urls", True),
        execution_mode="streaming",
        require_structured_output=len(outputs) > 1 or (len(outputs) == 1 and outputs[0].get("type") != "text"),
        output_schema=None,
        system_prompt=system_prompt,
        system_prompt_template=system_prompt,
        constraints=constraints,
        input_schema=params,
        is_parameterized=len(params) > 0,
        output_definitions=outputs,
    )


def build_runtime_config_from_snapshot(
    snapshot: dict,
    agent_id: UUID,
    agent_slug: str,
    version: str | int,
    profile_id: UUID,
) -> AgentRuntimeConfig:
    """Build AgentRuntimeConfig from a version snapshot dict."""
    return build_runtime_config(
        agent_id=agent_id,
        agent_slug=agent_slug,
        name=snapshot.get("name", ""),
        version=version,
        profile_id=profile_id,
        system_prompt=snapshot.get("system_prompt", ""),
        llm_config=snapshot.get("llm_config"),
        tools_config=snapshot.get("tools_config"),
        memory_config=snapshot.get("memory_config"),
        parameters=snapshot.get("parameters"),
        output_definitions=snapshot.get("output_definitions"),
    )
