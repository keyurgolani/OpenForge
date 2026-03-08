"""LLM Council Service — manages council configs in the database."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional

from openforge.db.models import LLMCouncilConfig, LLMCouncilMember, LLMEndpoint


class LLMCouncilService:
    async def get_config(self, db: AsyncSession, virtual_provider_id: UUID) -> Optional[dict]:
        result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.virtual_provider_id == virtual_provider_id)
            .options(
                selectinload(LLMCouncilConfig.members).selectinload(LLMCouncilMember.endpoint),
                selectinload(LLMCouncilConfig.chairman_endpoint),
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            return None
        return self._config_to_dict(config)

    async def create_config(self, db: AsyncSession, virtual_provider_id: UUID, chairman_endpoint_id: UUID, parallel_execution: bool, judging_prompt: Optional[str], members: list[dict]) -> dict:
        config = LLMCouncilConfig(
            virtual_provider_id=virtual_provider_id,
            chairman_endpoint_id=chairman_endpoint_id,
            parallel_execution=parallel_execution,
            judging_prompt=judging_prompt,
        )
        db.add(config)
        await db.flush()

        for member_data in members:
            member = LLMCouncilMember(
                council_config_id=config.id,
                endpoint_id=UUID(str(member_data["endpoint_id"])),
                display_label=member_data.get("display_label"),
            )
            db.add(member)

        await db.commit()
        return await self.get_config(db, virtual_provider_id)

    async def update_config(self, db: AsyncSession, virtual_provider_id: UUID, **kwargs) -> Optional[dict]:
        result = await db.execute(
            select(LLMCouncilConfig)
            .where(LLMCouncilConfig.virtual_provider_id == virtual_provider_id)
            .options(selectinload(LLMCouncilConfig.members))
        )
        config = result.scalar_one_or_none()
        if not config:
            return None

        if "chairman_endpoint_id" in kwargs:
            config.chairman_endpoint_id = UUID(str(kwargs["chairman_endpoint_id"]))
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
                    endpoint_id=UUID(str(member_data["endpoint_id"])),
                    display_label=member_data.get("display_label"),
                )
                db.add(member)

        await db.commit()
        return await self.get_config(db, virtual_provider_id)

    async def delete_config(self, db: AsyncSession, virtual_provider_id: UUID):
        result = await db.execute(
            select(LLMCouncilConfig).where(LLMCouncilConfig.virtual_provider_id == virtual_provider_id)
        )
        config = result.scalar_one_or_none()
        if config:
            await db.delete(config)
            await db.commit()

    def _config_to_dict(self, config: LLMCouncilConfig) -> dict:
        members = []
        for member in config.members:
            members.append({
                "id": str(member.id),
                "endpoint_id": str(member.endpoint_id),
                "endpoint_display_name": member.endpoint.display_name if member.endpoint else None,
                "endpoint_type": member.endpoint.endpoint_type if member.endpoint else None,
                "display_label": member.display_label,
            })

        return {
            "id": str(config.id),
            "virtual_provider_id": str(config.virtual_provider_id),
            "chairman_endpoint_id": str(config.chairman_endpoint_id),
            "chairman_endpoint_display_name": config.chairman_endpoint.display_name if config.chairman_endpoint else None,
            "parallel_execution": config.parallel_execution,
            "judging_prompt": config.judging_prompt,
            "members": members,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }


llm_council_service = LLMCouncilService()
