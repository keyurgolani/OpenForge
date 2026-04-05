"""Handoff engine — delegation and transfer between agents."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.runtime.agent_registry import agent_registry

logger = logging.getLogger("openforge.runtime.handoff_engine")


class HandoffEngine:
    """Manages agent-to-agent delegation and conversation transfer."""

    async def delegate(
        self,
        *,
        db: AsyncSession,
        instruction: str,
        target_agent_slug: str,
        parent_run_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Delegate a task to another agent.

        Uses agent_registry → execute_agent, falls back to
        chat_handler.execute_subagent.
        """
        spec = await agent_registry.resolve(db, slug=target_agent_slug)
        if spec is not None:
            from openforge.runtime.agent_executor import execute_agent
            from openforge.runtime.event_publisher import EventPublisher
            from openforge.core.llm_gateway import llm_gateway
            from openforge.integrations.tools.dispatcher import tool_dispatcher

            result = await execute_agent(
                spec,
                {"instruction": instruction, "message": instruction},
                db=db,
                event_publisher=EventPublisher(db),
                tool_dispatcher=tool_dispatcher,
                llm_gateway=llm_gateway,
            )
            return {
                "response": result.get("output", ""),
                "timeline": result.get("timeline", []),
                "agent_run": True,
            }

        # Fallback: use chat_handler for agents without compiled specs
        from openforge.runtime.chat_handler import chat_handler

        return await chat_handler.execute_subagent(
            instruction=instruction,
            db=db,
            agent_id=target_agent_slug,
        )

    async def transfer_to(
        self,
        *,
        db: AsyncSession,
        target_agent_slug: str,
        conversation_id: UUID,
        messages: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Swarm-style transfer: switch the active agent for a conversation."""
        from openforge.db.models import Conversation

        conversation = await db.get(Conversation, conversation_id)
        if conversation is None:
            return {"transferred": False, "target_agent": target_agent_slug, "error": "Conversation not found"}

        spec = await agent_registry.resolve(db, slug=target_agent_slug)
        if spec is not None:
            conversation.subagent_agent_id = target_agent_slug
            await db.commit()
            return {"transferred": True, "target_agent": target_agent_slug}

        return {"transferred": False, "target_agent": target_agent_slug, "error": "Agent not found"}


handoff_engine = HandoffEngine()
