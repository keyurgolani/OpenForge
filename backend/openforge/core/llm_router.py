"""LLM Router — routes requests to appropriate models based on complexity classification.

Fully composable: both the routing model and tier targets are endpoints,
which can be standard models or other virtual providers.
"""
import logging
import re
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import LLMEndpoint, LLMRouterConfig

logger = logging.getLogger("openforge.llm_router")

ROUTING_PROMPT = """You are a complexity classifier. Given a user prompt, classify its complexity on a scale from 0 to 1:

0.0 - 0.25: Simple (basic questions, simple formatting, greetings)
0.25 - 0.50: Moderate (requires reasoning, multi-step logic)
0.50 - 0.75: Complex (requires deep analysis, code generation, creative work)
0.75 - 1.0: Expert (requires specialized knowledge, complex problem solving)

Respond with ONLY a single number between 0 and 1, nothing else.

Prompt: {prompt}

Complexity score:"""

TIER_RANGES = {
    "simple": (0.0, 0.25),
    "moderate": (0.25, 0.50),
    "complex": (0.50, 0.75),
    "expert": (0.75, 1.0),
}


class LLMRouter:
    def __init__(self, resolver, db: AsyncSession, config: LLMRouterConfig, routing_endpoint: LLMEndpoint):
        self.resolver = resolver
        self.db = db
        self.config = config
        self.routing_endpoint = routing_endpoint

    async def classify_complexity(self, prompt: str, *, _depth: int) -> float:
        try:
            routing_prompt = self.config.routing_prompt or ROUTING_PROMPT
            classification_messages = [
                {"role": "user", "content": routing_prompt.format(prompt=prompt)}
            ]
            response = await self.resolver.chat(
                self.db, self.routing_endpoint, classification_messages,
                max_tokens=10, _depth=_depth,
            )
            content = response.strip()
            try:
                score = float(content)
                return max(0.0, min(1.0, score))
            except ValueError:
                match = re.search(r'[\d.]+', content)
                if match:
                    score = float(match.group())
                    return max(0.0, min(1.0, score))
                return 0.5
        except Exception as e:
            logger.warning(f"Complexity classification failed: {e}, defaulting to moderate")
            return 0.5

    def _select_tier_endpoint(self, complexity: float) -> LLMEndpoint | None:
        """Select the best tier endpoint for a given complexity score."""
        best = None
        for tier in sorted(self.config.tiers, key=lambda t: t.priority):
            level = tier.complexity_level
            # Support both named levels and "min-max" format
            if level in TIER_RANGES:
                lo, hi = TIER_RANGES[level]
            elif "-" in level:
                try:
                    parts = level.split("-")
                    lo, hi = float(parts[0]), float(parts[1])
                except (ValueError, IndexError):
                    continue
            else:
                continue

            if lo <= complexity <= hi:
                best = tier.endpoint
                break

        # Fallback to highest tier
        if not best and self.config.tiers:
            best = sorted(self.config.tiers, key=lambda t: t.priority)[-1].endpoint

        return best

    async def stream(
        self,
        messages: list[dict],
        *,
        max_tokens: int = 2000,
        include_thinking: bool = False,
        _depth: int = 0,
    ) -> AsyncGenerator[dict, None]:
        # Get last user message
        user_prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                user_prompt = content if isinstance(content, str) else str(content)
                break

        complexity = await self.classify_complexity(user_prompt, _depth=_depth)
        logger.info(f"Router classified complexity: {complexity:.2f}")

        tier_endpoint = self._select_tier_endpoint(complexity)
        if not tier_endpoint:
            raise ValueError("No models configured for routing")

        yield {
            "type": "metadata",
            "data": {
                "complexity_score": complexity,
                "selected_tier": self._get_tier_name(complexity),
            },
        }

        # Stream from the selected tier endpoint (composable — could be another virtual provider)
        async for event in self.resolver.stream_events(
            self.db, tier_endpoint, messages,
            max_tokens=max_tokens,
            include_thinking=include_thinking,
            _depth=_depth,
        ):
            yield event

    def _get_tier_name(self, complexity: float) -> str:
        for name, (lo, hi) in TIER_RANGES.items():
            if lo <= complexity <= hi:
                return name
        return "unknown"
