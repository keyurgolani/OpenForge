"""Unified endpoint resolver for composable LLM virtual providers.

Resolves any LLMEndpoint (standard or virtual) to a streaming response.
Virtual providers recursively resolve their constituent endpoints, enabling
arbitrary composition (e.g., Optimizer -> Router -> Council -> standard models).
"""
import logging
import time
from typing import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from openforge.db.models import (
    LLMEndpoint,
    LLMProvider,
    LLMVirtualProvider,
    LLMRouterConfig,
    LLMRouterTier,
    LLMCouncilConfig,
    LLMCouncilMember,
    LLMOptimizerConfig,
)
from openforge.utils.crypto import decrypt_value
from openforge.core.llm_gateway import llm_gateway

logger = logging.getLogger("openforge.endpoint_resolver")

MAX_RECURSION_DEPTH = 10


class EndpointResolver:
    """Resolves any endpoint to a streaming response, handling virtual provider composition."""

    async def resolve_provider_info(self, db: AsyncSession, endpoint: LLMEndpoint) -> dict:
        """Resolve a standard endpoint to provider connection info."""
        if endpoint.endpoint_type != "standard":
            raise ValueError("Can only resolve provider info for standard endpoints")

        provider = endpoint.provider
        if not provider:
            result = await db.execute(
                select(LLMProvider).where(LLMProvider.id == endpoint.provider_id)
            )
            provider = result.scalar_one_or_none()
            if not provider:
                raise ValueError(f"Provider not found for endpoint {endpoint.id}")

        api_key = ""
        if provider.api_key_enc:
            api_key = decrypt_value(provider.api_key_enc)

        return {
            "provider_name": provider.provider_name,
            "api_key": api_key,
            "model": endpoint.model_id,
            "base_url": provider.base_url,
        }

    async def stream_events(
        self,
        db: AsyncSession,
        endpoint: LLMEndpoint,
        messages: list[dict],
        *,
        max_tokens: int = 2000,
        include_thinking: bool = False,
        _depth: int = 0,
    ) -> AsyncGenerator[dict, None]:
        """Stream events from an endpoint. Works for both standard and virtual endpoints.

        Yields dicts with keys:
            type: "token" | "thinking" | "metadata"
            content: str (for token/thinking)
            data: dict (for metadata)
        """
        if _depth > MAX_RECURSION_DEPTH:
            raise RuntimeError("Maximum virtual provider recursion depth exceeded — check for circular references")

        if endpoint.endpoint_type == "standard":
            info = await self.resolve_provider_info(db, endpoint)
            async for event in llm_gateway.stream_events(
                messages=messages,
                provider_name=info["provider_name"],
                api_key=info["api_key"],
                model=info["model"],
                base_url=info["base_url"],
                max_tokens=max_tokens,
                include_thinking=include_thinking,
            ):
                yield event
            return

        # Virtual endpoint — resolve the virtual provider
        vp = endpoint.virtual_provider
        if not vp:
            result = await db.execute(
                select(LLMVirtualProvider).where(LLMVirtualProvider.id == endpoint.virtual_provider_id)
            )
            vp = result.scalar_one_or_none()
            if not vp:
                raise ValueError(f"Virtual provider not found for endpoint {endpoint.id}")

        if vp.virtual_type == "router":
            async for event in self._stream_router(db, vp, messages, max_tokens=max_tokens, include_thinking=include_thinking, _depth=_depth):
                yield event
        elif vp.virtual_type == "council":
            async for event in self._stream_council(db, vp, messages, max_tokens=max_tokens, _depth=_depth):
                yield event
        elif vp.virtual_type == "optimizer":
            async for event in self._stream_optimizer(db, vp, messages, max_tokens=max_tokens, include_thinking=include_thinking, _depth=_depth):
                yield event
        else:
            raise ValueError(f"Unknown virtual provider type: {vp.virtual_type}")

    async def chat(
        self,
        db: AsyncSession,
        endpoint: LLMEndpoint,
        messages: list[dict],
        *,
        max_tokens: int = 2000,
        _depth: int = 0,
    ) -> str:
        """Non-streaming chat via an endpoint. Collects all token and thinking content."""
        tokens = ""
        thinking = ""
        async for event in self.stream_events(db, endpoint, messages, max_tokens=max_tokens, _depth=_depth):
            etype = event.get("type")
            if etype in ("token", "content"):
                tokens += event.get("content", "")
            elif etype == "thinking":
                thinking += event.get("content", "")
        # Prefer token content; fall back to thinking if the model only produced thinking output
        return tokens if tokens else thinking

    async def _load_endpoint(self, db: AsyncSession, endpoint_id: UUID) -> LLMEndpoint:
        result = await db.execute(
            select(LLMEndpoint)
            .where(LLMEndpoint.id == endpoint_id)
            .options(selectinload(LLMEndpoint.provider), selectinload(LLMEndpoint.virtual_provider))
        )
        ep = result.scalar_one_or_none()
        if not ep:
            raise ValueError(f"Endpoint {endpoint_id} not found")
        return ep

    # ── Router ────────────────────────────────────────────────────────────────

    async def _stream_router(
        self, db: AsyncSession, vp: LLMVirtualProvider, messages: list[dict],
        *, max_tokens: int, include_thinking: bool, _depth: int,
    ) -> AsyncGenerator[dict, None]:
        from openforge.core.llm_router import LLMRouter

        config_result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.virtual_provider_id == vp.id)
            .options(selectinload(LLMRouterConfig.tiers).selectinload(LLMRouterTier.endpoint))
        )
        config = config_result.scalar_one_or_none()
        if not config:
            raise ValueError(f"Router config not found for virtual provider {vp.id}")

        routing_endpoint = await self._load_endpoint(db, config.routing_endpoint_id)
        router = LLMRouter(self, db, config, routing_endpoint)

        start = time.time()
        async for event in router.stream(messages, max_tokens=max_tokens, include_thinking=include_thinking, _depth=_depth + 1):
            yield event

        routing_time_ms = (time.time() - start) * 1000
        yield {
            "type": "metadata",
            "data": {
                "type": "router",
                "routing_time_ms": routing_time_ms,
            },
        }

    # ── Council ───────────────────────────────────────────────────────────────

    async def _stream_council(
        self, db: AsyncSession, vp: LLMVirtualProvider, messages: list[dict],
        *, max_tokens: int, _depth: int,
    ) -> AsyncGenerator[dict, None]:
        from openforge.core.llm_council import LLMCouncil

        config_result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.virtual_provider_id == vp.id)
            .options(selectinload(LLMCouncilConfig.members).selectinload(LLMCouncilMember.endpoint))
        )
        config = config_result.scalar_one_or_none()
        if not config:
            raise ValueError(f"Council config not found for virtual provider {vp.id}")

        chairman_endpoint = await self._load_endpoint(db, config.chairman_endpoint_id)
        council = LLMCouncil(self, db, config, chairman_endpoint)

        start = time.time()
        async for event in council.stream(messages, max_tokens=max_tokens, _depth=_depth + 1):
            yield event

        deliberation_time_ms = (time.time() - start) * 1000
        yield {
            "type": "metadata",
            "data": {
                "type": "council",
                "deliberation_time_ms": deliberation_time_ms,
            },
        }

    # ── Optimizer ─────────────────────────────────────────────────────────────

    async def _stream_optimizer(
        self, db: AsyncSession, vp: LLMVirtualProvider, messages: list[dict],
        *, max_tokens: int, include_thinking: bool, _depth: int,
    ) -> AsyncGenerator[dict, None]:
        from openforge.core.llm_optimizer import LLMOptimizer

        config_result = await db.execute(
            select(LLMOptimizerConfig)
            .where(LLMOptimizerConfig.virtual_provider_id == vp.id)
        )
        config = config_result.scalar_one_or_none()
        if not config:
            raise ValueError(f"Optimizer config not found for virtual provider {vp.id}")

        optimizer_endpoint = await self._load_endpoint(db, config.optimizer_endpoint_id)
        target_endpoint = await self._load_endpoint(db, config.target_endpoint_id)
        optimizer = LLMOptimizer(self, db, config, optimizer_endpoint, target_endpoint)

        async for event in optimizer.stream(messages, max_tokens=max_tokens, include_thinking=include_thinking, _depth=_depth + 1):
            yield event


endpoint_resolver = EndpointResolver()
