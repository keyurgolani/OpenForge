"""LLM Optimizer — optimizes user prompts before sending to the target model.

Fully composable: both the optimizer model and target are endpoints,
which can be standard models or other virtual providers.
"""
import logging
import time
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import LLMEndpoint, LLMOptimizerConfig

logger = logging.getLogger("openforge.llm_optimizer")

DEFAULT_OPTIMIZATION_PROMPT = """You are a prompt optimizer. Your task is to rewrite the following user prompt to be clearer, more specific, and more likely to get a high-quality response from an AI assistant.

Improve the prompt by:
1. Adding relevant context or constraints
2. Making the request more specific
3. Clarifying ambiguous terms
4. Ensuring the desired output format is clear

Original prompt: {original_prompt}

Respond with ONLY the improved prompt, nothing else:"""


class LLMOptimizer:
    def __init__(
        self,
        resolver,
        db: AsyncSession,
        config: LLMOptimizerConfig,
        optimizer_endpoint: LLMEndpoint,
        target_endpoint: LLMEndpoint,
    ):
        self.resolver = resolver
        self.db = db
        self.config = config
        self.optimizer_endpoint = optimizer_endpoint
        self.target_endpoint = target_endpoint

    async def optimize_prompt(self, user_message: str, *, _depth: int) -> tuple[str, float]:
        """Optimize a user prompt. Returns (optimized_prompt, time_ms)."""
        start = time.time()

        optimization_prompt = self.config.optimization_prompt or DEFAULT_OPTIMIZATION_PROMPT
        additional_context = self.config.additional_context or ""

        full_prompt = optimization_prompt.format(original_prompt=user_message)
        if additional_context:
            full_prompt = f"Context: {additional_context}\n\n{full_prompt}"

        logger.info("Optimizer: sending prompt to optimizer endpoint (user_msg=%r)", user_message[:100])

        try:
            optimized = await self.resolver.chat(
                self.db, self.optimizer_endpoint,
                [{"role": "user", "content": full_prompt}],
                max_tokens=500, _depth=_depth,
            )
            time_ms = (time.time() - start) * 1000
            if not optimized or not optimized.strip():
                logger.warning("Optimizer returned empty result, using original prompt")
                return user_message, time_ms
            logger.info("Optimizer: got optimized prompt (%d chars) in %.0fms", len(optimized.strip()), time_ms)
            return optimized.strip(), time_ms
        except Exception as e:
            logger.warning(f"Prompt optimization failed, using original: {e}")
            return user_message, 0.0

    async def stream(
        self,
        messages: list[dict],
        *,
        max_tokens: int = 2000,
        include_thinking: bool = False,
        _depth: int = 0,
    ) -> AsyncGenerator[dict, None]:
        # Extract the last user message from the conversation
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                user_message = content if isinstance(content, str) else str(content)
                break

        if not user_message.strip():
            logger.warning("Optimizer: no user message found in %d messages", len(messages))

        logger.info("Optimizer: extracted user message: %r (from %d messages)", user_message[:100], len(messages))

        # Optimize the prompt
        optimized_prompt, optimization_time_ms = await self.optimize_prompt(user_message, _depth=_depth)

        # Replace the last user message with the optimized version
        optimized_messages = list(messages)
        for i in range(len(optimized_messages) - 1, -1, -1):
            if optimized_messages[i].get("role") == "user":
                optimized_messages[i] = {**optimized_messages[i], "content": optimized_prompt}
                break

        # Emit optimization metadata
        yield {
            "type": "metadata",
            "data": {
                "type": "optimizer",
                "original_prompt": user_message[:200],
                "optimized_prompt": optimized_prompt[:200],
                "optimization_time_ms": optimization_time_ms,
            },
        }

        # Stream from target endpoint (composable — could be a router, council, etc.)
        async for event in self.resolver.stream_events(
            self.db, self.target_endpoint, optimized_messages,
            max_tokens=max_tokens,
            include_thinking=include_thinking,
            _depth=_depth,
        ):
            yield event
