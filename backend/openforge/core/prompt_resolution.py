"""Prompt resolution utilities.

Surviving prompt functions after the prompts domain was removed.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


def render_prompt_template(text: str, **variables: Any) -> str:
    """Render a prompt template string with the given variables."""
    return text.format_map(variables)


async def resolve_prompt_text(
    db: AsyncSession,
    prompt_id: str,
    *,
    default_text: str | None = None,
    version: int | None = None,
    **variables: Any,
) -> str:
    """Resolve a prompt by ID.

    Since the managed prompt system (PromptDefinitionModel) was removed,
    this now just returns the default_text rendered with variables. If no default_text
    is provided and no prompt can be resolved, raises ValueError.
    """
    if default_text is not None:
        return render_prompt_template(default_text, **variables)
    raise ValueError(f"Prompt '{prompt_id}' not found and no default_text provided")


async def resolve_profile_system_prompt(
    db: AsyncSession,
    agent: Any,
    context: str = "runtime",
    **variables: Any,
) -> str:
    """Resolve the system prompt for an agent profile.

    Handles catalogue references (catalogue:prompt_id) or direct text.
    """
    raw_prompt = (getattr(agent, "system_prompt", "") or "").strip()
    if not raw_prompt:
        prompt_ref = (getattr(agent, "system_prompt_ref", "") or "").strip()
        if prompt_ref:
            raw_prompt = prompt_ref if prompt_ref.startswith("catalogue:") else f"catalogue:{prompt_ref}"

    if raw_prompt.startswith("catalogue:"):
        prompt_id = raw_prompt.split(":", 1)[1]
        return await resolve_prompt_text(
            db,
            prompt_id,
            default_text="You are a helpful AI assistant.",
            **variables,
        )

    if not raw_prompt:
        return "You are a helpful AI assistant."

    return render_prompt_template(raw_prompt, **variables)
