"""Prompt Optimizer for OpenForge v2.5."""
import logging
import time
from typing import AsyncGenerator

import litellm

from openforge.core.llm_gateway import llm_gateway

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
    """Optimizes user prompts before sending to target LLM."""

    def __init__(self, config: dict):
        self.config = config

    async def optimize_prompt(self, user_message: str) -> tuple[str, float]:
        """
        Optimize a user prompt.

        Returns:
            Tuple of (optimized_prompt, time_ms)
        """
        start = time.time()

        optimization_prompt = self.config.get("optimization_prompt") or DEFAULT_OPTIMIZATION_PROMPT
        additional_context = self.config.get("additional_context") or ""

        full_prompt = optimization_prompt.format(original_prompt=user_message)
        if additional_context:
            full_prompt = f"Context: {additional_context}\n\n{full_prompt}"

        try:
            response = await litellm.acompletion(
                model=llm_gateway._resolve_model(
                    self.config["optimizer_provider_name"],
                    self.config["optimizer_model"],
                ),
                messages=[{"role": "user", "content": full_prompt}],
                api_key=self.config.get("optimizer_api_key") or None,
                api_base=self.config.get("optimizer_base_url"),
                max_tokens=500,
            )
            optimized = llm_gateway._normalize_content(response.choices[0].message.content)
            time_ms = (time.time() - start) * 1000
            return optimized.strip(), time_ms
        except Exception as e:
            logger.warning(f"Prompt optimization failed, using original: {e}")
            return user_message, 0.0

    async def stream_via_target(self, messages: list[dict], user_message: str) -> AsyncGenerator[tuple[str, dict], None]:
        """Optimize user message then stream from target LLM."""
        optimized_prompt, optimization_time_ms = await self.optimize_prompt(user_message)

        # Replace the last user message with the optimized version
        optimized_messages = list(messages)
        for i in range(len(optimized_messages) - 1, -1, -1):
            if optimized_messages[i].get("role") == "user":
                optimized_messages[i] = {**optimized_messages[i], "content": optimized_prompt}
                break

        # Build metadata
        metadata = {
            "type": "optimizer",
            "optimizer_model": self.config["optimizer_model"],
            "original_prompt": user_message[:200],
            "optimized_prompt": optimized_prompt[:200],
            "optimization_time_ms": optimization_time_ms,
            "target_provider": self.config.get("target_provider_name"),
            "target_model": self.config["target_model"],
        }

        # Stream from target
        async for token in llm_gateway.stream(
            messages=optimized_messages,
            provider_name=self.config["target_provider_name"],
            api_key=self.config.get("target_api_key") or "",
            model=self.config["target_model"],
            base_url=self.config.get("target_base_url"),
        ):
            yield token, metadata
