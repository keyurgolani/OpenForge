"""Context-aware preamble/postamble construction for agent system prompts.

Agents receive different instructions depending on their mode:
- interactive: Respond conversationally, output_definitions guide content not format
- pipeline: Produce structured JSON matching output_definitions
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID


def build_preamble(
    agent_name: str,
    agent_description: str,
    agent_mode: str = "interactive",
    *,
    input_schema: list[dict[str, Any]] | None = None,
    output_definitions: list[dict[str, Any]] | None = None,
    input_values: dict[str, Any] | None = None,
) -> str:
    """Build mode-appropriate preamble for an agent.

    interactive mode: conversational instructions, output_definitions as content guidance.
    pipeline mode: structured JSON output instructions.
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

    if agent_mode == "pipeline":
        # Input schema documentation
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

        # Show actual input values so the agent knows what to work on
        if input_values:
            lines.append("")
            lines.append("## Input Values")
            lines.append("These are the actual values provided for this execution. Use them to fulfill your task:")
            for name, value in input_values.items():
                val_str = str(value) if not isinstance(value, str) else value
                # Truncate very long values to keep preamble readable
                if len(val_str) > 2000:
                    val_str = val_str[:2000] + "… (truncated)"
                lines.append(f"- **{name}**: {val_str}")

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
    else:
        # Interactive / chat mode
        lines.extend([
            "",
            "# Response Guidelines",
            "",
            "You are in a **live conversation** with a user. Respond naturally and conversationally.",
            "",
            "- Write clear, well-structured responses using markdown formatting",
            "- Do NOT wrap your response in JSON, code blocks, or any structured output format",
            '- Do NOT produce fenced output blocks or {"key": "value"} wrappers — just respond directly',
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

    return "\n".join(lines).strip()


def build_postamble(
    workspace_id: UUID | None,
    workspaces_data: list[dict[str, Any]],
    agents_data: list[dict[str, Any]],
    tools_data: list[dict[str, Any]],
    skills_data: list[dict[str, Any]],
    *,
    tools_enabled: bool = True,
    deployment_workspace: dict[str, Any] | None = None,
    mission_workspace: dict[str, Any] | None = None,
) -> str:
    """Build postamble with operational context. Same for all agent modes."""
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

    # Deployment shared knowledge section
    if deployment_workspace:
        dw_lines = [
            "\n## Deployment Shared Knowledge",
            "You are running inside a **deployment**. This deployment has a dedicated "
            "shared knowledge workspace that persists across runs.",
            "",
            f"- **{deployment_workspace['name']}** (id: `{deployment_workspace['id']}`"
            f", {deployment_workspace.get('knowledge_count', 0)} knowledge items)",
            "",
            "Use this workspace to:",
            "- **Persist findings** that should be available to future runs of this deployment",
            "- **Read prior findings** from previous runs for continuity",
            "- **Accumulate data** over time rather than starting from scratch each run",
            "",
            "When saving to this workspace, use descriptive titles with dates "
            "so future runs can search effectively.",
            "",
            "This workspace is separate from your user workspaces listed above.",
        ]
        parts.append("\n".join(dw_lines))

    # Mission workspace section
    if mission_workspace:
        mw_lines = [
            "\n## Mission Workspace",
            "You are running inside a **mission** — a goal-directed autonomous cycle. "
            "This mission has a dedicated workspace for cross-cycle persistence.",
            "",
            f"- **{mission_workspace['name']}** (id: `{mission_workspace['id']}`"
            f", {mission_workspace.get('knowledge_count', 0)} knowledge items)",
            "",
            "Use this workspace to:",
            "- **Save journal entries** using the `platform.workspace.save_knowledge` tool with "
            "`type: \"journal\"` and this workspace_id to record learnings, plan changes, "
            "milestones, strategy shifts, hypotheses, and warnings",
            "- **Read prior cycle outputs** using `platform.workspace.search` with this workspace_id",
            "- **Persist intermediate results** that inform future cycles using `platform.workspace.save_knowledge`",
            "",
            "This workspace is separate from user workspaces.",
        ]
        parts.append("\n".join(mw_lines))

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


def build_mission_context(
    mission_name: str,
    goal: str,
    directives: list[str],
    constraints: list[dict],
    rubric: list[dict],
    cycle_number: int,
    current_plan: dict | None,
    previous_evaluation: dict | None,
    budget_remaining: dict | None,
) -> str:
    """Build the mission-specific instruction block for a cycle execution.

    Generates a comprehensive context that tells the agent about its mission
    goal, standing directives, constraints, evaluation criteria, previous
    results, and the required structured output format.
    """
    lines: list[str] = [
        "# Mission Context",
        f"You are executing a cycle for mission **{mission_name}**.",
        f"This is **cycle #{cycle_number}**.",
    ]

    # Goal
    lines.append("")
    lines.append("## Goal")
    lines.append(goal)

    # Standing directives
    if directives:
        lines.append("")
        lines.append("## Standing Directives")
        for i, directive in enumerate(directives, 1):
            lines.append(f"{i}. {directive}")

    # Constraints
    if constraints:
        lines.append("")
        lines.append("## Constraints")
        for c in constraints:
            severity = c.get("severity", "medium")
            marker = {"critical": "[CRITICAL]", "high": "[HIGH]", "medium": "[MEDIUM]", "low": "[LOW]"}.get(
                severity, f"[{severity.upper()}]"
            )
            desc = c.get("description", c.get("name", ""))
            lines.append(f"- {marker} {desc}")

    # Evaluation criteria
    if rubric:
        lines.append("")
        lines.append("## Evaluation Criteria")
        lines.append("You will self-evaluate against these criteria at the end of each cycle:")
        for criterion in rubric:
            name = criterion.get("name", "")
            description = criterion.get("description", "")
            target = criterion.get("target")
            ratchet = criterion.get("ratchet", "relaxed")
            line = f"- **{name}**"
            if description:
                line += f": {description}"
            extras = []
            if target is not None:
                extras.append(f"target: {target}")
            extras.append(f"ratchet: {ratchet}")
            line += f" ({', '.join(extras)})"
            lines.append(line)

    # Previous cycle results
    if previous_evaluation:
        lines.append("")
        lines.append("## Previous Cycle Scores")
        lines.append("These are your evaluation scores from the previous cycle. "
                      "Aim to maintain or improve them:")
        for criterion_name, score in previous_evaluation.items():
            lines.append(f"- **{criterion_name}**: {score}")

    # Current working plan
    if current_plan:
        lines.append("")
        lines.append("## Current Working Plan")
        lines.append("This is your current plan from the previous cycle. "
                      "You may refine or replace it:")
        lines.append(f"```json\n{_format_json(current_plan)}\n```")

    # Budget remaining
    if budget_remaining:
        lines.append("")
        lines.append("## Budget Remaining")
        for resource, remaining in budget_remaining.items():
            lines.append(f"- **{resource}**: {remaining}")

    # Workflow instructions
    lines.append("")
    lines.append("## Cycle Workflow")
    lines.append("Execute the following phases as a single continuous workflow:")
    lines.append("")
    lines.append("1. **Perceive** — Gather information. Use tools to read workspace knowledge, "
                 "search for relevant data, and understand the current state of your mission.")
    lines.append("2. **Plan** — Based on your observations, create or refine your plan. "
                 "Identify specific actions to take this cycle.")
    lines.append("3. **Act** — Execute your plan. Use tools to create knowledge, "
                 "invoke agents, call APIs, or perform other actions.")
    lines.append("4. **Evaluate** — Self-assess your progress against the rubric criteria. "
                 "Score each criterion honestly.")
    lines.append("5. **Reflect** — Consider what worked, what didn't, and what to change. "
                 "Update your plan for the next cycle.")

    # Required output format
    lines.append("")
    lines.append("## Required Output")
    lines.append("")
    lines.append("**CRITICAL: Do NOT try to call a tool named `mission_output`. "
                 "This is a text format, not a tool. Do NOT call a tool named `journal` either. "
                 "Simply write the fenced block below as plain text in your response.**")
    lines.append("")
    lines.append("You MUST include this block. Without it, your cycle results cannot be tracked.")
    lines.append("")
    lines.append("After completing all phases, produce a structured output block. "
                 "Wrap it in a fenced code block with the `mission_output` language tag. "
                 "This block MUST be the LAST thing in your response — nothing should follow it.")
    lines.append("")
    lines.append("```mission_output")
    lines.append("{")
    lines.append('  "phase_summaries": {')
    lines.append('    "perceive": "Summary of observations...",')
    lines.append('    "plan": "Summary of plan decisions...",')
    lines.append('    "act": "Summary of actions taken...",')
    lines.append('    "evaluate": "Summary of evaluation...",')
    lines.append('    "reflect": "Summary of reflections..."')
    lines.append("  },")
    lines.append('  "actions_taken": [')
    lines.append('    {"action": "description", "result": "outcome"},')
    lines.append('    ...')
    lines.append("  ],")
    lines.append('  "evaluation_scores": {')

    if rubric:
        for i, criterion in enumerate(rubric):
            comma = "," if i < len(rubric) - 1 else ""
            lines.append(f'    "{criterion.get("name", "")}": <0.0-1.0>{comma}')
    else:
        lines.append('    "criterion_name": "<0.0-1.0>"')

    lines.append("  },")
    lines.append('  "updated_plan": {')
    lines.append('    "objectives": ["..."],')
    lines.append('    "next_actions": ["..."],')
    lines.append('    "hypotheses": ["..."]')
    lines.append("  },")
    lines.append('  "next_cycle_reason": "Why another cycle is needed (or \'complete\' if done)",')
    lines.append('  "next_cycle_delay_seconds": 300')
    lines.append("}")
    lines.append("```")
    lines.append("")
    lines.append("Remember: the ```mission_output``` block above is plain text you write in your "
                 "response. It is NOT a tool call. End your response with this block.")

    return "\n".join(lines).strip()


def _format_json(data: dict | list) -> str:
    """Format a dict/list as indented JSON for display in prompts."""
    try:
        import json
        return json.dumps(data, indent=2, default=str)
    except (TypeError, ValueError):
        return str(data)
