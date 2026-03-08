"""LLM Optimizer Service — manages optimizer configs in the database."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional

from openforge.db.models import LLMOptimizerConfig, LLMEndpoint


class LLMOptimizerService:
    async def get_config(self, db: AsyncSession, virtual_provider_id: UUID) -> Optional[dict]:
        try:
            result = await db.execute(
                select(LLMOptimizerConfig)
                .where(LLMOptimizerConfig.virtual_provider_id == virtual_provider_id)
                .options(
                    selectinload(LLMOptimizerConfig.optimizer_endpoint),
                    selectinload(LLMOptimizerConfig.target_endpoint),
                )
            )
            config = result.scalar_one_or_none()
            if not config:
                return None
            return self._config_to_dict(config)
        except Exception:
            return None

    async def create_config(
        self,
        db: AsyncSession,
        virtual_provider_id: UUID,
        optimizer_endpoint_id: UUID,
        target_endpoint_id: UUID,
        optimization_prompt: Optional[str] = None,
        additional_context: Optional[str] = None,
    ) -> dict:
        config = LLMOptimizerConfig(
            virtual_provider_id=virtual_provider_id,
            optimizer_endpoint_id=optimizer_endpoint_id,
            target_endpoint_id=target_endpoint_id,
            optimization_prompt=optimization_prompt,
            additional_context=additional_context,
        )
        db.add(config)
        await db.commit()
        return await self.get_config(db, virtual_provider_id)

    async def update_config(self, db: AsyncSession, virtual_provider_id: UUID, **kwargs) -> Optional[dict]:
        result = await db.execute(
            select(LLMOptimizerConfig)
            .where(LLMOptimizerConfig.virtual_provider_id == virtual_provider_id)
        )
        config = result.scalar_one_or_none()
        if not config:
            return None

        if "optimizer_endpoint_id" in kwargs:
            config.optimizer_endpoint_id = UUID(str(kwargs["optimizer_endpoint_id"]))
        if "target_endpoint_id" in kwargs:
            config.target_endpoint_id = UUID(str(kwargs["target_endpoint_id"]))
        if "optimization_prompt" in kwargs:
            config.optimization_prompt = kwargs["optimization_prompt"]
        if "additional_context" in kwargs:
            config.additional_context = kwargs["additional_context"]

        await db.commit()
        return await self.get_config(db, virtual_provider_id)

    async def delete_config(self, db: AsyncSession, virtual_provider_id: UUID):
        result = await db.execute(
            select(LLMOptimizerConfig).where(LLMOptimizerConfig.virtual_provider_id == virtual_provider_id)
        )
        config = result.scalar_one_or_none()
        if config:
            await db.delete(config)
            await db.commit()

    def _config_to_dict(self, config: LLMOptimizerConfig) -> dict:
        return {
            "id": str(config.id),
            "virtual_provider_id": str(config.virtual_provider_id),
            "optimizer_endpoint_id": str(config.optimizer_endpoint_id),
            "optimizer_endpoint_display_name": config.optimizer_endpoint.display_name if config.optimizer_endpoint else None,
            "target_endpoint_id": str(config.target_endpoint_id),
            "target_endpoint_display_name": config.target_endpoint.display_name if config.target_endpoint else None,
            "optimization_prompt": config.optimization_prompt,
            "additional_context": config.additional_context,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }


llm_optimizer_service = LLMOptimizerService()
