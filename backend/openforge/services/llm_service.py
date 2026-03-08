from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from typing import Optional, Union
from openforge.db.models import LLMProvider, Workspace
from openforge.schemas.llm import (
    LLMProviderCreate,
    LLMProviderUpdate,
    LLMProviderResponse,
    ModelInfo,
    ConnectionTestResult,
)
from openforge.utils.crypto import encrypt_value, decrypt_value
from openforge.core.llm_gateway import llm_gateway
from fastapi import HTTPException
import logging

logger = logging.getLogger("openforge.llm_service")


def _to_response(provider: LLMProvider) -> LLMProviderResponse:
    return LLMProviderResponse(
        id=provider.id,
        provider_name=provider.provider_name,
        display_name=provider.display_name,
        provider_type=getattr(provider, 'provider_type', 'standard'),
        endpoint_id=provider.endpoint_id,
        base_url=provider.base_url,
        default_model=provider.default_model,
        enabled_models=provider.enabled_models,
        is_system_default=provider.is_system_default,
        has_api_key=provider.api_key_enc is not None,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


class LLMService:
    async def create_provider(self, db: AsyncSession, data: LLMProviderCreate) -> LLMProviderResponse:
        # Check if this is the first provider — if so, make it the default
        count_result = await db.execute(select(func.count(LLMProvider.id)))
        is_first = count_result.scalar() == 0

        provider = LLMProvider(
            provider_name=data.provider_name,
            display_name=data.display_name,
            endpoint_id=data.endpoint_id,
            base_url=data.base_url,
            default_model=data.default_model,
            enabled_models=data.enabled_models,
            is_system_default=is_first,
        )
        if data.api_key:
            provider.api_key_enc = encrypt_value(data.api_key)

        db.add(provider)
        await db.commit()
        await db.refresh(provider)
        return _to_response(provider)

    async def list_providers(self, db: AsyncSession) -> list[LLMProviderResponse]:
        result = await db.execute(select(LLMProvider))
        return [_to_response(p) for p in result.scalars().all()]

    async def get_provider(self, db: AsyncSession, provider_id: UUID) -> LLMProviderResponse:
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        return _to_response(provider)

    async def update_provider(self, db: AsyncSession, provider_id: UUID, data: LLMProviderUpdate) -> LLMProviderResponse:
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        if data.display_name is not None:
            provider.display_name = data.display_name
        if data.endpoint_id is not None:
            provider.endpoint_id = data.endpoint_id
        if data.base_url is not None:
            provider.base_url = data.base_url
        if data.default_model is not None:
            provider.default_model = data.default_model
        if data.enabled_models is not None:
            provider.enabled_models = data.enabled_models
        if data.api_key is not None:
            provider.api_key_enc = encrypt_value(data.api_key)

        await db.commit()
        await db.refresh(provider)
        return _to_response(provider)

    async def delete_provider(self, db: AsyncSession, provider_id: UUID):
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        was_default = provider.is_system_default
        await db.delete(provider)
        await db.flush()

        if was_default:
            # Promote the next available provider
            next_result = await db.execute(select(LLMProvider).limit(1))
            next_provider = next_result.scalar_one_or_none()
            if next_provider:
                next_provider.is_system_default = True

        await db.commit()

    async def set_default_provider(self, db: AsyncSession, provider_id: UUID) -> LLMProviderResponse:
        # Un-set any current default
        current_result = await db.execute(
            select(LLMProvider).where(LLMProvider.is_system_default == True)
        )
        for current in current_result.scalars().all():
            current.is_system_default = False

        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        provider.is_system_default = True
        await db.commit()
        await db.refresh(provider)
        return _to_response(provider)

    async def get_provider_for_workspace(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        provider_id: Optional[Union[UUID, str]] = None,
        model_override: Optional[str] = None,
    ) -> tuple[str, str, str, str | None, str]:
        """Returns (provider_name, decrypted_api_key, model, base_url, provider_type)."""
        # If specific provider requested, use it
        provider = None
        if provider_id:
            parsed_provider_id = provider_id
            if isinstance(provider_id, str):
                try:
                    parsed_provider_id = UUID(provider_id)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=f"Invalid provider_id: {provider_id}") from exc
            p_result = await db.execute(
                select(LLMProvider).where(LLMProvider.id == parsed_provider_id)
            )
            provider = p_result.scalar_one_or_none()

        # Check workspace override
        ws_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = ws_result.scalar_one_or_none()

        if not provider and workspace and workspace.llm_provider_id:
            p_result = await db.execute(
                select(LLMProvider).where(LLMProvider.id == workspace.llm_provider_id)
            )
            provider = p_result.scalar_one_or_none()

        if not provider:
            # Fall back to system default
            p_result = await db.execute(
                select(LLMProvider).where(LLMProvider.is_system_default == True)
            )
            provider = p_result.scalar_one_or_none()

        if not provider:
            raise HTTPException(status_code=400, detail="No LLM provider configured")

        api_key = ""
        if provider.api_key_enc:
            api_key = decrypt_value(provider.api_key_enc)

        # Priority: explicit override > workspace override > provider default
        model = (
            model_override
            or (workspace.llm_model if workspace and workspace.llm_model else None)
            or provider.default_model
            or ((provider.enabled_models or [{}])[0].get("id") if provider.enabled_models else None)
            or ""
        )
        if not model:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No model configured for provider '{provider.display_name}'. "
                    "Set a default model in Settings > AI Providers."
                ),
            )
        provider_type = getattr(provider, 'provider_type', 'standard')
        return provider.provider_name, api_key, model, provider.base_url, provider_type

    async def list_models(self, db: AsyncSession, provider_id: UUID) -> list[ModelInfo]:
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        api_key = decrypt_value(provider.api_key_enc) if provider.api_key_enc else None
        models_raw = await llm_gateway.list_models(provider.provider_name, api_key, provider.base_url)
        return [ModelInfo(id=m["id"], name=m["name"]) for m in models_raw]

    async def test_connection(self, db: AsyncSession, provider_id: UUID) -> ConnectionTestResult:
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        api_key = decrypt_value(provider.api_key_enc) if provider.api_key_enc else None
        test_result = await llm_gateway.test_connection(
            provider.provider_name, api_key, provider.default_model, provider.base_url
        )
        return ConnectionTestResult(**test_result)


llm_service = LLMService()
