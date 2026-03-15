from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.domains.prompts.types import PromptRenderError
from openforge.domains.prompts.service import render_managed_prompt


def render_prompt_template(text: str, **variables: Any) -> str:
    return text.format_map(variables)


async def resolve_prompt_text(
    db: AsyncSession,
    prompt_id: str,
    *,
    default_text: str | None = None,
    version: int | None = None,
    **variables: Any,
) -> str:
    try:
        rendered = await render_managed_prompt(
            db,
            prompt_id,
            variables=variables,
            version=version,
            context="runtime",
        )
        return rendered.content
    except PromptRenderError:
        if default_text is not None:
            return render_prompt_template(default_text, **variables)
        raise


async def resolve_agent_system_prompt(db: AsyncSession, agent: Any, **variables: Any) -> str:
    raw_prompt = (getattr(agent, "system_prompt", "") or "").strip()
    if not raw_prompt:
        prompt_ref = (getattr(agent, "system_prompt_ref", "") or "").strip()
        if prompt_ref:
            raw_prompt = prompt_ref if prompt_ref.startswith("catalogue:") else f"catalogue:{prompt_ref}"
    if raw_prompt.startswith("catalogue:"):
        prompt_id = raw_prompt.split(":", 1)[1]
        return await resolve_prompt_text(db, prompt_id, **variables)

    if not raw_prompt and getattr(agent, "id", "") == "workspace_agent":
        return await resolve_prompt_text(db, "agent_system", **variables)

    return render_prompt_template(raw_prompt, **variables)
