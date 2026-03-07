"""
LLM Router for OpenForge v2.

Routes requests to appropriate models based on complexity classification.
"""
import logging
from typing import Any, Optional, AsyncGenerator
from dataclasses import dataclass, field

import litellm

from openforge.core.llm_gateway import llm_gateway

logger = logging.getLogger("openforge.llm_router")


@dataclass
class RouterTier:
    """A complexity tier with associated models."""
    name: str  # simple, moderate, complex, expert
    models: list[dict] = field(default_factory=list)  # List of {"provider_id", "model", "api_key", "base_url"}
    complexity_range: tuple[float, float] = (0.0, 1.0)  # (min, max) complexity score


@dataclass
class RouterConfig:
    """Configuration for an LLM Router."""
    router_id: str
    router_provider_id: str  # Provider to use for routing decisions
    router_model: str  # Model to use for routing decisions
    router_api_key: Optional[str] = None
    router_base_url: Optional[str] = None
    tiers: list[RouterTier] = field(default_factory=list)


ROUTING_PROMPT = """You are a complexity classifier. Given a user prompt, classify its complexity on a scale from 0 to 1:

0.0 - 0.25: Simple (basic questions, simple formatting, greetings)
0.25 - 0.50: Moderate (requires reasoning, multi-step logic)
0.50 - 0.75: Complex (requires deep analysis, code generation, creative work)
0.75 - 1.0: Expert (requires specialized knowledge, complex problem solving)

Respond with ONLY a single number between 0 and 1, nothing else.

Prompt: {prompt}

Complexity score:"""


class LLMRouter:
    """
    Routes LLM requests to appropriate models based on complexity.

    How it works:
    1. User sends a prompt
    2. Router model classifies complexity (0-1)
    3. Select appropriate tier based on complexity score
    4. Try first model in tier, fallback to next if fails
    5. Return response
    """

    def __init__(self, config: RouterConfig):
        self.config = config

    async def classify_complexity(self, prompt: str) -> float:
        """
        Classify the complexity of a prompt.

        Returns:
            Float between 0 and 1
        """
        try:
            response = await litellm.acompletion(
                model=llm_gateway._resolve_model(
                    self.config.router_provider_id,
                    self.config.router_model
                ),
                messages=[{"role": "user", "content": ROUTING_PROMPT.format(prompt=prompt)}],
                api_key=self.config.router_api_key or None,
                api_base=self.config.router_base_url,
                max_tokens=10,
            )

            content = response.choices[0].message.content.strip()

            # Parse the score
            try:
                score = float(content)
                return max(0.0, min(1.0, score))
            except ValueError:
                # Try to extract number from response
                import re
                match = re.search(r'[\d.]+', content)
                if match:
                    score = float(match.group())
                    return max(0.0, min(1.0, score))
                return 0.5  # Default to moderate

        except Exception as e:
            logger.warning(f"Complexity classification failed: {e}, defaulting to moderate")
            return 0.5

    def select_tier(self, complexity: float) -> Optional[RouterTier]:
        """Select the appropriate tier for a complexity score."""
        for tier in self.config.tiers:
            if tier.complexity_range[0] <= complexity <= tier.complexity_range[1]:
                return tier
        # Default to highest tier if no match
        return self.config.tiers[-1] if self.config.tiers else None

    async def chat(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
    ) -> str:
        """
        Route a chat request to the appropriate model.

        Args:
            messages: Conversation messages
            max_tokens: Maximum tokens for response

        Returns:
            Model response
        """
        # Get the last user message for complexity classification
        user_prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_prompt = msg.get("content", "")
                break

        # Classify complexity
        complexity = await self.classify_complexity(user_prompt)
        logger.info(f"Classified complexity: {complexity:.2f}")

        # Select tier
        tier = self.select_tier(complexity)
        if not tier or not tier.models:
            raise ValueError("No models configured for routing")

        logger.info(f"Selected tier: {tier.name} with {len(tier.models)} models")

        # Try models in order (with fallback)
        last_error = None
        for i, model_config in enumerate(tier.models):
            try:
                logger.info(f"Trying model {i+1}/{len(tier.models)}: {model_config.get('model')}")

                response = await litellm.acompletion(
                    model=llm_gateway._resolve_model(
                        model_config.get("provider_id", "openai"),
                        model_config.get("model", "gpt-4o-mini")
                    ),
                    messages=messages,
                    api_key=model_config.get("api_key") or None,
                    api_base=model_config.get("base_url"),
                    max_tokens=max_tokens,
                )

                return llm_gateway._normalize_content(response.choices[0].message.content)

            except Exception as e:
                logger.warning(f"Model {model_config.get('model')} failed: {e}")
                last_error = e
                continue

        # All models failed
        raise RuntimeError(f"All models in tier {tier.name} failed. Last error: {last_error}")

    async def stream(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
    ) -> AsyncGenerator[str, None]:
        """
        Route a streaming chat request.

        Args:
            messages: Conversation messages
            max_tokens: Maximum tokens for response

        Yields:
            Response tokens
        """
        # Get the last user message for complexity classification
        user_prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_prompt = msg.get("content", "")
                break

        # Classify complexity
        complexity = await self.classify_complexity(user_prompt)
        logger.info(f"Classified complexity: {complexity:.2f}")

        # Select tier
        tier = self.select_tier(complexity)
        if not tier or not tier.models:
            raise ValueError("No models configured for routing")

        logger.info(f"Selected tier: {tier.name} with {len(tier.models)} models")

        # Try models in order (with fallback)
        last_error = None
        for i, model_config in enumerate(tier.models):
            try:
                logger.info(f"Trying model {i+1}/{len(tier.models)}: {model_config.get('model')}")

                response = await litellm.acompletion(
                    model=llm_gateway._resolve_model(
                        model_config.get("provider_id", "openai"),
                        model_config.get("model", "gpt-4o-mini")
                    ),
                    messages=messages,
                    api_key=model_config.get("api_key") or None,
                    api_base=model_config.get("base_url"),
                    max_tokens=max_tokens,
                    stream=True,
                )

                async for chunk in response:
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        yield delta.content

                return  # Success, exit generator

            except Exception as e:
                logger.warning(f"Model {model_config.get('model')} failed: {e}")
                last_error = e
                continue

        # All models failed
        raise RuntimeError(f"All models in tier {tier.name} failed. Last error: {last_error}")


def create_default_router_config() -> RouterConfig:
    """Create a default router configuration with standard tiers."""
    return RouterConfig(
        router_id="default",
        router_provider_id="openai",
        router_model="gpt-4o-mini",
        tiers=[
            RouterTier(
                name="simple",
                complexity_range=(0.0, 0.25),
                models=[],
            ),
            RouterTier(
                name="moderate",
                complexity_range=(0.25, 0.50),
                models=[],
            ),
            RouterTier(
                name="complex",
                complexity_range=(0.50, 0.75),
                models=[],
            ),
            RouterTier(
                name="expert",
                complexity_range=(0.75, 1.0),
                models=[],
            ),
        ],
    )
