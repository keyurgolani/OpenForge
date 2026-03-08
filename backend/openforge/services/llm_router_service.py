"""LLM Router Service — manages router configs in the database."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional

from openforge.db.models import LLMRouterConfig, LLMRouterTier, LLMEndpoint


class LLMRouterService:
    async def get_config(self, db: AsyncSession, virtual_provider_id: UUID) -> Optional[dict]:
        result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.virtual_provider_id == virtual_provider_id)
            .options(
                selectinload(LLMRouterConfig.tiers).selectinload(LLMRouterTier.endpoint),
                selectinload(LLMRouterConfig.routing_endpoint),
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            return None
        return self._config_to_dict(config)

    async def create_config(self, db: AsyncSession, virtual_provider_id: UUID, routing_endpoint_id: UUID, routing_prompt: Optional[str], tiers: list[dict]) -> dict:
        config = LLMRouterConfig(
            virtual_provider_id=virtual_provider_id,
            routing_endpoint_id=routing_endpoint_id,
            routing_prompt=routing_prompt,
        )
        db.add(config)
        await db.flush()

        for tier_data in tiers:
            tier = LLMRouterTier(
                router_config_id=config.id,
                complexity_level=tier_data["complexity_level"],
                endpoint_id=UUID(str(tier_data["endpoint_id"])),
                priority=tier_data.get("priority", 0),
            )
            db.add(tier)

        await db.commit()
        return await self.get_config(db, virtual_provider_id)

    async def update_config(self, db: AsyncSession, virtual_provider_id: UUID, **kwargs) -> Optional[dict]:
        result = await db.execute(
            select(LLMRouterConfig)
            .where(LLMRouterConfig.virtual_provider_id == virtual_provider_id)
            .options(selectinload(LLMRouterConfig.tiers))
        )
        config = result.scalar_one_or_none()
        if not config:
            return None

        if "routing_endpoint_id" in kwargs:
            config.routing_endpoint_id = UUID(str(kwargs["routing_endpoint_id"]))
        if "routing_prompt" in kwargs:
            config.routing_prompt = kwargs["routing_prompt"]

        if "tiers" in kwargs and kwargs["tiers"] is not None:
            for tier in config.tiers:
                await db.delete(tier)
            await db.flush()
            for tier_data in kwargs["tiers"]:
                tier = LLMRouterTier(
                    router_config_id=config.id,
                    complexity_level=tier_data["complexity_level"],
                    endpoint_id=UUID(str(tier_data["endpoint_id"])),
                    priority=tier_data.get("priority", 0),
                )
                db.add(tier)

        await db.commit()
        return await self.get_config(db, virtual_provider_id)

    async def delete_config(self, db: AsyncSession, virtual_provider_id: UUID):
        result = await db.execute(
            select(LLMRouterConfig).where(LLMRouterConfig.virtual_provider_id == virtual_provider_id)
        )
        config = result.scalar_one_or_none()
        if config:
            await db.delete(config)
            await db.commit()

    def _config_to_dict(self, config: LLMRouterConfig) -> dict:
        tiers = []
        for tier in sorted(config.tiers, key=lambda t: t.priority):
            tiers.append({
                "id": str(tier.id),
                "complexity_level": tier.complexity_level,
                "priority": tier.priority,
                "endpoint_id": str(tier.endpoint_id),
                "endpoint_display_name": tier.endpoint.display_name if tier.endpoint else None,
                "endpoint_type": tier.endpoint.endpoint_type if tier.endpoint else None,
            })

        return {
            "id": str(config.id),
            "virtual_provider_id": str(config.virtual_provider_id),
            "routing_endpoint_id": str(config.routing_endpoint_id),
            "routing_endpoint_display_name": config.routing_endpoint.display_name if config.routing_endpoint else None,
            "routing_prompt": config.routing_prompt,
            "tiers": tiers,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }


llm_router_service = LLMRouterService()
