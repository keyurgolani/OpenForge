"""LLM Router Service - manages router configs in the database."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional

from openforge.db.models import LLMRouterConfig, LLMRouterTier, LLMProvider
from openforge.utils.crypto import decrypt_value


class LLMRouterService:
    async def get_config(self, db: AsyncSession, provider_id: UUID) -> Optional[dict]:
        """Load router config with tiers from DB."""
        result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.llm_provider_id == provider_id)
            .options(selectinload(LLMRouterConfig.tiers))
        )
        config = result.scalar_one_or_none()
        if not config:
            return None
        return await self._config_to_dict(db, config)

    async def create_config(self, db: AsyncSession, provider_id: UUID, routing_model_provider_id: UUID, routing_model: str, routing_prompt: Optional[str], tiers: list[dict]) -> dict:
        """Create router config with tiers."""
        config = LLMRouterConfig(
            llm_provider_id=provider_id,
            routing_model_provider_id=routing_model_provider_id,
            routing_model=routing_model,
            routing_prompt=routing_prompt,
        )
        db.add(config)
        await db.flush()  # get config.id

        for tier_data in tiers:
            tier = LLMRouterTier(
                router_config_id=config.id,
                complexity_level=tier_data["complexity_level"],
                llm_provider_id=UUID(tier_data["llm_provider_id"]),
                model=tier_data["model"],
                priority=tier_data.get("priority", 0),
            )
            db.add(tier)

        await db.commit()
        await db.refresh(config)
        # Re-fetch with tiers
        result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.id == config.id)
            .options(selectinload(LLMRouterConfig.tiers))
        )
        config = result.scalar_one()
        return await self._config_to_dict(db, config)

    async def update_config(self, db: AsyncSession, provider_id: UUID, **kwargs) -> Optional[dict]:
        """Update router config and optionally replace tiers."""
        result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.llm_provider_id == provider_id)
            .options(selectinload(LLMRouterConfig.tiers))
        )
        config = result.scalar_one_or_none()
        if not config:
            return None

        if "routing_model" in kwargs:
            config.routing_model = kwargs["routing_model"]
        if "routing_model_provider_id" in kwargs:
            config.routing_model_provider_id = UUID(kwargs["routing_model_provider_id"])
        if "routing_prompt" in kwargs:
            config.routing_prompt = kwargs["routing_prompt"]

        if "tiers" in kwargs and kwargs["tiers"] is not None:
            # Delete existing tiers
            for tier in config.tiers:
                await db.delete(tier)
            await db.flush()
            # Add new tiers
            for tier_data in kwargs["tiers"]:
                tier = LLMRouterTier(
                    router_config_id=config.id,
                    complexity_level=tier_data["complexity_level"],
                    llm_provider_id=UUID(tier_data["llm_provider_id"]),
                    model=tier_data["model"],
                    priority=tier_data.get("priority", 0),
                )
                db.add(tier)

        await db.commit()
        result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.id == config.id)
            .options(selectinload(LLMRouterConfig.tiers))
        )
        config = result.scalar_one()
        return await self._config_to_dict(db, config)

    async def delete_config(self, db: AsyncSession, provider_id: UUID):
        result = await db.execute(
            select(LLMRouterConfig).where(LLMRouterConfig.llm_provider_id == provider_id)
        )
        config = result.scalar_one_or_none()
        if config:
            await db.delete(config)
            await db.commit()

    async def _config_to_dict(self, db: AsyncSession, config: LLMRouterConfig) -> dict:
        tiers = []
        for tier in sorted(config.tiers, key=lambda t: t.priority):
            # Look up provider for decrypted API key
            p_result = await db.execute(select(LLMProvider).where(LLMProvider.id == tier.llm_provider_id))
            provider = p_result.scalar_one_or_none()
            tier_dict = {
                "id": str(tier.id),
                "complexity_level": tier.complexity_level,
                "priority": tier.priority,
                "llm_provider_id": str(tier.llm_provider_id),
                "model": tier.model,
                "provider_name": provider.provider_name if provider else None,
                "api_key": decrypt_value(provider.api_key_enc) if provider and provider.api_key_enc else "",
                "base_url": provider.base_url if provider else None,
            }
            tiers.append(tier_dict)

        # Get routing model provider
        rm_result = await db.execute(select(LLMProvider).where(LLMProvider.id == config.routing_model_provider_id))
        rm_provider = rm_result.scalar_one_or_none()

        return {
            "id": str(config.id),
            "llm_provider_id": str(config.llm_provider_id),
            "routing_model_provider_id": str(config.routing_model_provider_id),
            "routing_model": config.routing_model,
            "routing_prompt": config.routing_prompt,
            "routing_provider_name": rm_provider.provider_name if rm_provider else None,
            "routing_api_key": decrypt_value(rm_provider.api_key_enc) if rm_provider and rm_provider.api_key_enc else "",
            "routing_base_url": rm_provider.base_url if rm_provider else None,
            "tiers": tiers,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }


llm_router_service = LLMRouterService()
