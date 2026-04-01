"""Context-aware preamble/postamble construction for agent system prompts.

Agents receive different instructions depending on execution context:
- CHAT: Respond conversationally, output_definitions guide content not format
- AUTOMATION: Produce structured JSON matching output_definitions
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID


class ExecutionContext(str, Enum):
    CHAT = "chat"
    AUTOMATION = "automation"


def build_preamble(
    agent_name: str,
    agent_description: str,
    context: ExecutionContext,
    *,
    input_schema: list[dict[str, Any]] | None = None,
    output_definitions: list[dict[str, Any]] | None = None,
    input_values: dict[str, Any] | None = None,
) -> str:
    """Build context-appropriate preamble for an agent.

    Chat context: conversational instructions, output_definitions as content guidance.
    Automation context: structured JSON output instructions.
    """
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    lines = [
        f"# Agent: {agent_name}",
        f"You are **{agent_name}**"
        + (f" — {agent_description}." if agent_description else ", an AI agent on OpenForge."),
        f"You are running on the **OpenForge** platform. Today's date is {date_str}.",
        "Do not fabricate authorship lines, team names, or dates in your responses.",
    ]

    if context == ExecutionContext.CHAT:
        lines.extend([
            "",
            "# Response Guidelines",
            "",
            "You are in a **live conversation** with a user. Respond naturally and conversationally.",
            "",
            "- Write clear, well-structured responses using markdown formatting",
            "- Do NOT wrap your response in JSON, code blocks, or any structured output format",
            "- Do NOT produce fenced output blocks or {\"key\": \"value\"} wrappers — just respond directly",
        ])

        # Show input values (already extracted) for context
        if input_values:
            lines.append("")
            lines.append("# Context")
            lines.append("")
            lines.append("The following input values have been provided for this conversation:")
            for name, value in input_values.items():
                lines.append(f"- **{name}**: {value}")

        # Output definitions as content guidance
        if output_definitions:
            lines.append("")
            lines.append("# Response Content")
            lines.append("")
            lines.append("Your response should address the following aspects:")
            for od in output_definitions:
                key = od.get("key") or od.get("name", "")
                label = od.get("label") or key
                od_type = od.get("type", "")
                lines.append(f"- **{label}** ({od_type})")
            lines.append("")
            lines.append("Cover each of these areas naturally within your response. Do not use JSON or structured formatting.")

    elif context == ExecutionContext.AUTOMATION:
        # Input schema documentation (for automation, show the schema not the values)
        if input_schema:
            lines.append("")
            lines.append("## Input Variables")
            for p in input_schema:
                line = f"- `{p.get('name', '')}` ({p.get('type', 'text')}"
                if p.get("required"):
                    line += ", required"
                line += ")"
                if p.get("description"):
                    line += f" — {p['description']}"
                lines.append(line)

        # Structured output format instructions
        if output_definitions:
            lines.append("")
            lines.append("## Output Variables")
            lines.append("You MUST structure your final response so the system can extract these output variables:")
            for out in output_definitions:
                line = f"- `{out.get('key', '')}` ({out.get('type', '')})"
                if out.get("label"):
                    line += f" — {out['label']}"
                lines.append(line)
            lines.append("")
            lines.append("Wrap your structured output in a fenced block:")
            lines.append("```output\n{")
            for i, out in enumerate(output_definitions):
                comma = "," if i < len(output_definitions) - 1 else ""
                lines.append(f'  "{out.get("key", "")}": <{out.get("type", "")} value>{comma}')
            lines.append("}\n```")

    return "\n".join(lines).strip()


def build_postamble(
    workspace_id: UUID | None,
    workspaces_data: list[dict[str, Any]],
    agents_data: list[dict[str, Any]],
    tools_data: list[dict[str, Any]],
    skills_data: list[dict[str, Any]],
    *,
    tools_enabled: bool = True,
) -> str:
    """Build postamble with operational context. Same for both execution contexts."""
    parts: list[str] = ["# OpenForge Application Context"]

    # Workspace section
    if workspaces_data:
        if workspace_id is None:
            if len(workspaces_data) == 1:
                ws = workspaces_data[0]
                ws_context = (
                    f"You are operating in workspace **{ws['name']}** (id: `{ws['id']}`). "
                    "Always use this workspace_id for tool calls that require it."
                )
            else:
                ws_context = (
                    "You are running in a workspace-agnostic context. "
                    "When using workspace tools, you MUST pass the `workspace_id` parameter."
                )
        else:
            ws_context = (
                f"You are operating in workspace `{workspace_id}`. "
                "Workspace tools default to this workspace, but you can pass a different `workspace_id`."
            )
        ws_lines = ["\n## Available Workspaces", ws_context]
        for ws in workspaces_data:
            line = f"- **{ws['name']}** (id: `{ws['id']}`"
            if ws.get("knowledge_count"):
                line += f", {ws['knowledge_count']} knowledge items"
            line += ")"
            if ws.get("description"):
                line += f": {ws['description']}"
            ws_lines.append(line)
        parts.append("\n".join(ws_lines))

    # Agents section
    has_agent_invoke = any(
        t.get("id") in ("platform.agent.invoke", "agent.invoke")
        or t.get("name") in ("platform.agent.invoke", "agent.invoke")
        for t in tools_data
    )
    if has_agent_invoke and agents_data:
        ag_lines = ["\n## Available Agents", "You can invoke these agents via the `platform.agent.invoke` tool:"]
        for ag in agents_data:
            tags_str = f" [{', '.join(ag.get('tags', []))}]" if ag.get("tags") else ""
            ag_lines.append(f"- **{ag.get('slug', '')}**{tags_str}: {ag.get('description', '')}")
        parts.append("\n".join(ag_lines))

    # Tooling disabled
    if not tools_enabled:
        parts.append(
            "\n## Tooling disabled\n"
            "Do not claim to search workspace knowledge or use tools. "
            "Respond using conversation context and model knowledge only."
        )

    # Skills section
    if skills_data:
        sk_lines = [
            "\n## Available Skills",
            "If there are relevant skills, use tools to read the skills to enhance your ability to tackle the request.",
        ]
        for sk in skills_data:
            sk_lines.append(f"- `{sk.get('name', '')}`: {sk.get('description', '')}")
        parts.append("\n".join(sk_lines))

    return "\n".join(parts).strip()
