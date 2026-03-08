"""LLM Council Service - manages council configs in the database."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional

from openforge.db.models import LLMCouncilConfig, LLMCouncilMember, LLMProvider
from openforge.utils.crypto import decrypt_value


class LLMCouncilService:
    async def get_config(self, db: AsyncSession, provider_id: UUID) -> Optional[dict]:
        result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.llm_provider_id == provider_id)
            .options(selectinload(LLMCouncilConfig.members))
        )
        config = result.scalar_one_or_none()
        if not config:
            return None
        return await self._config_to_dict(db, config)

    async def create_config(self, db: AsyncSession, provider_id: UUID, chairman_provider_id: UUID, chairman_model: str, parallel_execution: bool, judging_prompt: Optional[str], members: list[dict]) -> dict:
        config = LLMCouncilConfig(
            llm_provider_id=provider_id,
            chairman_provider_id=chairman_provider_id,
            chairman_model=chairman_model,
            parallel_execution=parallel_execution,
            judging_prompt=judging_prompt,
        )
        db.add(config)
        await db.flush()

        for member_data in members:
            member = LLMCouncilMember(
                council_config_id=config.id,
                llm_provider_id=UUID(member_data["llm_provider_id"]),
                model=member_data["model"],
                display_label=member_data.get("display_label"),
            )
            db.add(member)

        await db.commit()
        result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.id == config.id)
            .options(selectinload(LLMCouncilConfig.members))
        )
        config = result.scalar_one()
        return await self._config_to_dict(db, config)

    async def update_config(self, db: AsyncSession, provider_id: UUID, **kwargs) -> Optional[dict]:
        result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.llm_provider_id == provider_id)
            .options(selectinload(LLMCouncilConfig.members))
        )
        config = result.scalar_one_or_none()
        if not config:
            return None

        if "chairman_provider_id" in kwargs:
            config.chairman_provider_id = UUID(kwargs["chairman_provider_id"])
        if "chairman_model" in kwargs:
            config.chairman_model = kwargs["chairman_model"]
        if "parallel_execution" in kwargs:
            config.parallel_execution = kwargs["parallel_execution"]
        if "judging_prompt" in kwargs:
            config.judging_prompt = kwargs["judging_prompt"]

        if "members" in kwargs and kwargs["members"] is not None:
            for m in config.members:
                await db.delete(m)
            await db.flush()
            for member_data in kwargs["members"]:
                member = LLMCouncilMember(
                    council_config_id=config.id,
                    llm_provider_id=UUID(member_data["llm_provider_id"]),
                    model=member_data["model"],
                    display_label=member_data.get("display_label"),
                )
                db.add(member)

        await db.commit()
        result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.id == config.id)
            .options(selectinload(LLMCouncilConfig.members))
        )
        config = result.scalar_one()
        return await self._config_to_dict(db, config)

    async def delete_config(self, db: AsyncSession, provider_id: UUID):
        result = await db.execute(
            select(LLMCouncilConfig).where(LLMCouncilConfig.llm_provider_id == provider_id)
        )
        config = result.scalar_one_or_none()
        if config:
            await db.delete(config)
            await db.commit()

    async def _config_to_dict(self, db: AsyncSession, config: LLMCouncilConfig) -> dict:
        members = []
        for member in config.members:
            p_result = await db.execute(select(LLMProvider).where(LLMProvider.id == member.llm_provider_id))
            provider = p_result.scalar_one_or_none()
            members.append({
                "id": str(member.id),
                "llm_provider_id": str(member.llm_provider_id),
                "model": member.model,
                "display_label": member.display_label,
                "provider_name": provider.provider_name if provider else None,
                "api_key": decrypt_value(provider.api_key_enc) if provider and provider.api_key_enc else "",
                "base_url": provider.base_url if provider else None,
            })

        # Chairman provider
        ch_result = await db.execute(select(LLMProvider).where(LLMProvider.id == config.chairman_provider_id))
        ch_provider = ch_result.scalar_one_or_none()

        return {
            "id": str(config.id),
            "llm_provider_id": str(config.llm_provider_id),
            "chairman_provider_id": str(config.chairman_provider_id),
            "chairman_model": config.chairman_model,
            "parallel_execution": config.parallel_execution,
            "judging_prompt": config.judging_prompt,
            "chairman_provider_name": ch_provider.provider_name if ch_provider else None,
            "chairman_api_key": decrypt_value(ch_provider.api_key_enc) if ch_provider and ch_provider.api_key_enc else "",
            "chairman_base_url": ch_provider.base_url if ch_provider else None,
            "members": members,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }


llm_council_service = LLMCouncilService()
