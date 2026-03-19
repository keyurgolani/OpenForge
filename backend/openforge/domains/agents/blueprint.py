"""Agent blueprint parsing and rendering.

Parses agent.md files (YAML frontmatter + Markdown body) into AgentBlueprint
models and renders them back.
"""

from __future__ import annotations

import hashlib
import re
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class ToolConfig(BaseModel):
    name: str
    confirm_before: bool = False
    description: Optional[str] = None


class ModelConfig(BaseModel):
    default: Optional[str] = None
    provider: Optional[str] = None
    allow_override: bool = True
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class MemoryConfig(BaseModel):
    history_limit: int = 20
    strategy: str = "sliding_window"
    attachment_support: bool = True
    auto_bookmark_urls: bool = True
    mention_support: bool = True


class OutputConfig(BaseModel):
    execution_mode: str = "streaming"
    require_structured: bool = False
    schema_ref: Optional[str] = None
    require_citations: bool = False


class RetrievalConfig(BaseModel):
    enabled: bool = True
    limit: int = 5
    score_threshold: float = 0.35


class AgentBlueprint(BaseModel):
    # Identity
    name: str
    slug: str
    version: str = "1.0.0"
    description: Optional[str] = None
    icon: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    mode: str = "interactive"
    strategy: str = "chat"

    # Configuration
    model: ModelConfig = Field(default_factory=ModelConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    output: OutputConfig = Field(default_factory=OutputConfig)
    retrieval: RetrievalConfig = Field(default_factory=RetrievalConfig)
    tools: list[ToolConfig] = Field(default_factory=list)
    confirm_before: list[str] = Field(default_factory=list)

    # Content (Markdown body)
    system_prompt: str = ""
    constraints: list[str] = Field(default_factory=list)


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)", re.DOTALL)
_CONSTRAINTS_RE = re.compile(
    r"##\s*Constraints\s*\n((?:[-*]\s+.+\n?)+)", re.IGNORECASE
)


def _parse_tools(raw: list | None) -> list[ToolConfig]:
    """Parse tools from frontmatter — accepts strings or dicts."""
    if not raw:
        return []
    tools = []
    for item in raw:
        if isinstance(item, str):
            tools.append(ToolConfig(name=item))
        elif isinstance(item, dict):
            tools.append(ToolConfig(**item))
    return tools


def _extract_constraints(body: str) -> list[str]:
    """Extract bullet points from a ## Constraints section."""
    match = _CONSTRAINTS_RE.search(body)
    if not match:
        return []
    lines = match.group(1).strip().splitlines()
    return [re.sub(r"^[-*]\s+", "", line).strip() for line in lines if line.strip()]


def parse_agent_md(content: str) -> tuple[AgentBlueprint, str]:
    """Parse agent.md content into AgentBlueprint + SHA-256 hash."""
    md_hash = hashlib.sha256(content.encode()).hexdigest()

    match = _FRONTMATTER_RE.match(content)
    if not match:
        # No frontmatter — treat entire content as system prompt
        return AgentBlueprint(name="untitled", slug="untitled", system_prompt=content.strip()), md_hash

    frontmatter_str, body = match.group(1), match.group(2)

    try:
        frontmatter = yaml.safe_load(frontmatter_str) or {}
    except yaml.YAMLError:
        return AgentBlueprint(name="untitled", slug="untitled", system_prompt=content.strip()), md_hash

    if not isinstance(frontmatter, dict):
        return AgentBlueprint(name="untitled", slug="untitled", system_prompt=content.strip()), md_hash

    # Parse nested config objects
    model_raw = frontmatter.pop("model", None) or {}
    memory_raw = frontmatter.pop("memory", None) or {}
    output_raw = frontmatter.pop("output", None) or {}
    retrieval_raw = frontmatter.pop("retrieval", None) or {}
    tools_raw = frontmatter.pop("tools", None)
    confirm_before = frontmatter.pop("confirm_before", []) or []

    # Extract constraints from body
    constraints = _extract_constraints(body)

    # Remove constraints section from system prompt
    system_prompt = _CONSTRAINTS_RE.sub("", body).strip()

    blueprint = AgentBlueprint(
        name=frontmatter.get("name", "untitled"),
        slug=frontmatter.get("slug", "untitled"),
        version=frontmatter.get("version", "1.0.0"),
        description=frontmatter.get("description"),
        icon=frontmatter.get("icon"),
        tags=frontmatter.get("tags", []) or [],
        mode=frontmatter.get("mode", "interactive"),
        strategy=frontmatter.get("strategy", "chat"),
        model=ModelConfig(**model_raw) if isinstance(model_raw, dict) else ModelConfig(),
        memory=MemoryConfig(**memory_raw) if isinstance(memory_raw, dict) else MemoryConfig(),
        output=OutputConfig(**output_raw) if isinstance(output_raw, dict) else OutputConfig(),
        retrieval=RetrievalConfig(**retrieval_raw) if isinstance(retrieval_raw, dict) else RetrievalConfig(),
        tools=_parse_tools(tools_raw),
        confirm_before=confirm_before if isinstance(confirm_before, list) else [],
        system_prompt=system_prompt,
        constraints=constraints,
    )
    return blueprint, md_hash


def render_agent_md(blueprint: AgentBlueprint) -> str:
    """Render an AgentBlueprint back to agent.md format."""
    frontmatter: dict = {
        "name": blueprint.name,
        "slug": blueprint.slug,
        "version": blueprint.version,
        "mode": blueprint.mode,
        "strategy": blueprint.strategy,
    }
    if blueprint.description:
        frontmatter["description"] = blueprint.description
    if blueprint.icon:
        frontmatter["icon"] = blueprint.icon
    if blueprint.tags:
        frontmatter["tags"] = blueprint.tags

    # Nested configs — only include non-default values
    model_dict = blueprint.model.model_dump(exclude_defaults=True)
    if model_dict:
        frontmatter["model"] = model_dict

    memory_dict = blueprint.memory.model_dump(exclude_defaults=True)
    if memory_dict:
        frontmatter["memory"] = memory_dict

    output_dict = blueprint.output.model_dump(exclude_defaults=True)
    if output_dict:
        frontmatter["output"] = output_dict

    retrieval_dict = blueprint.retrieval.model_dump(exclude_defaults=True)
    if retrieval_dict:
        frontmatter["retrieval"] = retrieval_dict

    if blueprint.tools:
        frontmatter["tools"] = [
            t.model_dump(exclude_defaults=True) if t.confirm_before or t.description else t.name
            for t in blueprint.tools
        ]

    if blueprint.confirm_before:
        frontmatter["confirm_before"] = blueprint.confirm_before

    yaml_str = yaml.dump(frontmatter, default_flow_style=False, sort_keys=False, allow_unicode=True)
    parts = [f"---\n{yaml_str}---\n"]

    if blueprint.system_prompt:
        parts.append(blueprint.system_prompt)

    if blueprint.constraints:
        parts.append("\n\n## Constraints")
        for constraint in blueprint.constraints:
            parts.append(f"- {constraint}")

    return "\n".join(parts) + "\n"


def slugify(text: str) -> str:
    """Simple slugify for workspace names."""
    slug = re.sub(r"[^\w\s-]", "", text.lower().strip())
    return re.sub(r"[-\s]+", "-", slug)


DEFAULT_AGENT_TEMPLATE = """---
name: {name}
slug: {slug}
mode: interactive
strategy: chat
model:
  allow_override: true
memory:
  history_limit: 20
  strategy: sliding_window
  attachment_support: true
retrieval:
  enabled: true
  limit: 5
tools: []
---
You are a helpful AI assistant. You have access to knowledge across all workspaces and can use tools to help complete tasks.

You can search any workspace's knowledge to find relevant information. When searching, consider which workspace(s) are most likely to contain the information needed.

## Constraints
- Always provide sources when referencing knowledge content
"""


def render_default_agent_md(workspace_name: str) -> str:
    """Render a default agent.md for a workspace."""
    slug = f"{slugify(workspace_name)}-assistant"
    return DEFAULT_AGENT_TEMPLATE.format(name=f"{workspace_name} Assistant", slug=slug)
