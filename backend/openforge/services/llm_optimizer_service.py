"""LLM Optimizer Service - manages optimizer configs in the database."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from typing import Optional

from openforge.utils.crypto import decrypt_value


class LLMOptimizerService:
    async def get_config(self, db: AsyncSession, provider_id: UUID) -> Optional[dict]:
        """Load optimizer config from DB."""
        try:
            from openforge.db.models import LLMOptimizerConfig
            result = await db.execute(
                select(LLMOptimizerConfig)
                .where(LLMOptimizerConfig.llm_provider_id == provider_id)
            )
            config = result.scalar_one_or_none()
            if not config:
                return None
            return await self._config_to_dict(db, config)
        except Exception:
            return None

    async def create_config(
        self,
        db: AsyncSession,
        provider_id: UUID,
        optimizer_provider_id: UUID,
        optimizer_model: str,
        target_provider_id: UUID,
        target_model: str,
        optimization_prompt: Optional[str] = None,
        additional_context: Optional[str] = None,
    ) -> dict:
        """Create optimizer config."""
        from openforge.db.models import LLMOptimizerConfig
        config = LLMOptimizerConfig(
            llm_provider_id=provider_id,
            optimizer_provider_id=optimizer_provider_id,
            optimizer_model=optimizer_model,
            target_provider_id=target_provider_id,
            target_model=target_model,
            optimization_prompt=optimization_prompt,
            additional_context=additional_context,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
        return await self._config_to_dict(db, config)

    async def update_config(self, db: AsyncSession, provider_id: UUID, **kwargs) -> Optional[dict]:
        """Update optimizer config."""
        from openforge.db.models import LLMOptimizerConfig
        result = await db.execute(
            select(LLMOptimizerConfig)
            .where(LLMOptimizerConfig.llm_provider_id == provider_id)
        )
        config = result.scalar_one_or_none()
        if not config:
            return None

        if "optimizer_provider_id" in kwargs:
            config.optimizer_provider_id = UUID(kwargs["optimizer_provider_id"])
        if "optimizer_model" in kwargs:
            config.optimizer_model = kwargs["optimizer_model"]
        if "target_provider_id" in kwargs:
            config.target_provider_id = UUID(kwargs["target_provider_id"])
        if "target_model" in kwargs:
            config.target_model = kwargs["target_model"]
        if "optimization_prompt" in kwargs:
            config.optimization_prompt = kwargs["optimization_prompt"]
        if "additional_context" in kwargs:
            config.additional_context = kwargs["additional_context"]

        await db.commit()
        await db.refresh(config)
        return await self._config_to_dict(db, config)

    async def delete_config(self, db: AsyncSession, provider_id: UUID):
        from openforge.db.models import LLMOptimizerConfig
        result = await db.execute(
            select(LLMOptimizerConfig).where(LLMOptimizerConfig.llm_provider_id == provider_id)
        )
        config = result.scalar_one_or_none()
        if config:
            await db.delete(config)
            await db.commit()

    async def _config_to_dict(self, db: AsyncSession, config) -> dict:
        from sqlalchemy import select as sa_select
        from openforge.db.models import LLMProvider

        async def get_provider(pid):
            res = await db.execute(sa_select(LLMProvider).where(LLMProvider.id == pid))
            return res.scalar_one_or_none()

        opt_provider = await get_provider(config.optimizer_provider_id)
        tgt_provider = await get_provider(config.target_provider_id)

        return {
            "id": str(config.id),
            "llm_provider_id": str(config.llm_provider_id),
            "optimizer_provider_id": str(config.optimizer_provider_id),
            "optimizer_model": config.optimizer_model,
            "target_provider_id": str(config.target_provider_id),
            "target_model": config.target_model,
            "optimization_prompt": config.optimization_prompt,
            "additional_context": config.additional_context,
            "optimizer_provider_name": opt_provider.provider_name if opt_provider else None,
            "optimizer_api_key": decrypt_value(opt_provider.api_key_enc) if opt_provider and opt_provider.api_key_enc else "",
            "optimizer_base_url": opt_provider.base_url if opt_provider else None,
            "target_provider_name": tgt_provider.provider_name if tgt_provider else None,
            "target_api_key": decrypt_value(tgt_provider.api_key_enc) if tgt_provider and tgt_provider.api_key_enc else "",
            "target_base_url": tgt_provider.base_url if tgt_provider else None,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }


llm_optimizer_service = LLMOptimizerService()
