"""Auto-capture hooks for notable events during agent execution.

Captures tool failures and user corrections as memories via Celery tasks,
so they can be stored without requiring a DB session in the calling context.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger("openforge.memory.auto_capture")

_CORRECTION_PATTERN = re.compile(
    r"\b(no|don'?t|instead|wrong|actually|not what|that'?s incorrect)\b",
    re.IGNORECASE,
)


def detect_correction(user_message: str) -> bool:
    """Return True if the user message contains correction patterns."""
    return bool(_CORRECTION_PATTERN.search(user_message))


async def capture_tool_failure(
    tool_name: str,
    error: str,
    params: str,
    execution_id: str,
    conversation_id: str,
    agent_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> None:
    """Store an experience memory about a tool failure via Celery."""
    content = (
        f"Tool '{tool_name}' failed. "
        f"Error: {str(error)[:200]}. "
        f"Params: {str(params)[:200]}"
    )
    tags = ["tool-failure", tool_name]

    try:
        from openforge.memory.tasks import store_memory_async_task

        store_memory_async_task.delay(
            content=content,
            source_type="agent",
            memory_type="experience",
            confidence=0.8,
            tags=tags,
            workspace_id=workspace_id,
            source_agent_id=agent_id,
            source_run_id=execution_id,
            source_conversation_id=conversation_id,
        )
    except Exception as e:
        logger.warning("Failed to queue tool failure memory: %s", e)


async def capture_correction(
    agent_response: str,
    user_correction: str,
    execution_id: str,
    conversation_id: str,
    agent_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> None:
    """Store a lesson memory about a user correction via Celery."""
    content = (
        f"Original approach: {str(agent_response)[:300]}. "
        f"Correction: {str(user_correction)[:300]}"
    )
    tags = ["correction"]

    try:
        from openforge.memory.tasks import store_memory_async_task

        store_memory_async_task.delay(
            content=content,
            source_type="agent",
            memory_type="lesson",
            confidence=0.8,
            tags=tags,
            workspace_id=workspace_id,
            source_agent_id=agent_id,
            source_run_id=execution_id,
            source_conversation_id=conversation_id,
        )
    except Exception as e:
        logger.warning("Failed to queue correction memory: %s", e)
