from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from typing import Optional, Union
from openforge.db.models import Config, LLMProvider
from openforge.schemas.llm import (
    LLMProviderCreate,
    LLMProviderUpdate,
    LLMProviderResponse,
    ModelInfo,
    ConnectionTestResult,
)
from openforge.common.crypto import decrypt_value, encrypt_value
from openforge.core.llm_gateway import llm_gateway
from fastapi import HTTPException
import logging

_llm_logger = logging.getLogger("openforge.services.llm_service")


def _safe_decrypt(enc_bytes: bytes | None, provider_name: str = "") -> str:
    """Decrypt API key, returning empty string on failure instead of crashing."""
    if not enc_bytes:
        return ""
    try:
        return decrypt_value(enc_bytes)
    except Exception:
        _llm_logger.warning(
            "Failed to decrypt API key for provider '%s'. "
            "Re-enter the key in Settings > Providers.",
            provider_name,
        )
        return ""
import logging

logger = logging.getLogger("openforge.llm_service")


def _to_response(provider: LLMProvider) -> LLMProviderResponse:
    return LLMProviderResponse(
        id=provider.id,
        provider_name=provider.provider_name,
        display_name=provider.display_name,
        endpoint_id=provider.endpoint_id,
        base_url=provider.base_url,
        default_model=provider.default_model,
        enabled_models=provider.enabled_models,
        is_system_default=provider.is_system_default,
        is_system=getattr(provider, "is_system", False),
        has_api_key=provider.api_key_enc is not None,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


class LLMService:
    async def create_provider(self, db: AsyncSession, data: LLMProviderCreate) -> LLMProviderResponse:
        # Check if this is the first non-local provider — if so, make it the default
        count_result = await db.execute(
            select(func.count(LLMProvider.id)).where(LLMProvider.is_system == False)
        )
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
            # Promote the next available non-local provider
            next_result = await db.execute(
                select(LLMProvider).where(LLMProvider.is_system == False).limit(1)
            )
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
        workspace_id: UUID | None = None,
        provider_id: Optional[Union[UUID, str]] = None,
        model_override: Optional[str] = None,
    ) -> tuple[str, str, str, str | None]:
        """Deprecated: use resolve_provider(). Kept for backward compat."""
        return await self.resolve_provider(db, provider_id=provider_id, model_override=model_override)

    async def resolve_provider(
        self,
        db: AsyncSession,
        provider_id: Optional[Union[UUID, str]] = None,
        model_override: Optional[str] = None,
    ) -> tuple[str, str, str, str | None]:
        """Returns (provider_name, decrypted_api_key, model, base_url)."""
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

        # Load system_chat_models setting (user's explicit model selection
        # from the Settings UI). This takes priority over is_system_default.
        _chat_models_entries: list[dict] = []
        if not provider or not model_override:
            cfg_result = await db.execute(
                select(Config).where(Config.key == "system_chat_models")
            )
            cfg_row = cfg_result.scalar_one_or_none()
            if cfg_row and cfg_row.value is not None:
                raw = cfg_row.value
                if isinstance(raw, str):
                    try:
                        import json as _json
                        raw = _json.loads(raw)
                    except (ValueError, TypeError):
                        raw = []
                if isinstance(raw, list):
                    _chat_models_entries = raw

        if not provider and _chat_models_entries:
            # Use the user's default model selection from system_chat_models
            default_entry = next((e for e in _chat_models_entries if e.get("is_default")), None)
            entry = default_entry or _chat_models_entries[0]
            if entry.get("provider_id"):
                try:
                    p_result = await db.execute(
                        select(LLMProvider).where(LLMProvider.id == UUID(entry["provider_id"]))
                    )
                    provider = p_result.scalar_one_or_none()
                except (ValueError, KeyError):
                    pass

        if not provider:
            # Fall back to system default (skip local-only providers)
            p_result = await db.execute(
                select(LLMProvider).where(
                    LLMProvider.is_system_default == True,
                    LLMProvider.is_system == False,
                )
            )
            provider = p_result.scalar_one_or_none()

        if not provider:
            raise HTTPException(status_code=400, detail="No LLM provider configured")

        api_key = ""
        if provider.api_key_enc:
            api_key = _safe_decrypt(provider.api_key_enc, provider.provider_name)

        # Priority: explicit override > provider default > system_chat_models setting
        model = (
            model_override
            or provider.default_model
            or ((provider.enabled_models or [{}])[0].get("id") if provider.enabled_models else None)
            or ""
        )

        # Fall back to the system_chat_models setting
        if not model and _chat_models_entries:
            provider_id_str = str(provider.id)
            # Prefer the default model for this provider
            for entry in _chat_models_entries:
                if entry.get("provider_id") == provider_id_str and entry.get("is_default"):
                    model = entry.get("model_id", "")
                    break
            # Otherwise take the first model for this provider
            if not model:
                for entry in _chat_models_entries:
                    if entry.get("provider_id") == provider_id_str and entry.get("model_id"):
                        model = entry["model_id"]
                        break

        # Last resort: auto-detect from provider's available models
        if not model:
            try:
                available = await self.list_models(db, provider.id)
                if available:
                    model = available[0].id
                    logger.info(
                        "Auto-selected model '%s' from provider '%s' (no default configured)",
                        model, provider.display_name,
                    )
            except Exception:
                pass

        if not model:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No model configured for provider '{provider.display_name}'. "
                    "Set a default model in Settings > AI Providers."
                ),
            )
        return provider.provider_name, api_key, model, provider.base_url

    async def get_vision_provider_for_workspace(
        self,
        db: AsyncSession,
        workspace_id: UUID | None = None,
    ) -> tuple[str, str, str, str | None]:
        """Deprecated: use resolve_vision_provider(). Kept for backward compat."""
        return await self.resolve_vision_provider(db)

    async def resolve_vision_provider(
        self,
        db: AsyncSession,
    ) -> tuple[str, str, str, str | None]:
        """Returns (provider_name, decrypted_api_key, model, base_url) for vision tasks."""
        from openforge.services.config_service import config_service

        provider = None
        model = None

        # Fall back to system-level vision config (set via Settings > Vision tab)
        if not provider:
            try:
                vision_pid = await config_service.get_config_raw(db, "system_vision_provider_id")
                if vision_pid:
                    from uuid import UUID as _UUID
                    p_result = await db.execute(
                        select(LLMProvider).where(LLMProvider.id == _UUID(str(vision_pid)))
                    )
                    provider = p_result.scalar_one_or_none()
                    if provider:
                        model = await config_service.get_config_raw(db, "system_vision_model") or ""
            except Exception:
                pass

        # Fall back to system default provider (NOT the workspace chat provider — to avoid
        # accidentally sending vision requests to a chat-only model)
        if not provider:
            p_result = await db.execute(
                select(LLMProvider).where(LLMProvider.is_system_default == True)
            )
            provider = p_result.scalar_one_or_none()

        if not provider:
            raise HTTPException(status_code=400, detail="No vision provider configured")

        api_key = ""
        if provider.api_key_enc:
            api_key = _safe_decrypt(provider.api_key_enc, provider.provider_name)

        if not model:
            model = provider.default_model or ""

        return provider.provider_name, api_key, model, provider.base_url

    async def list_models(self, db: AsyncSession, provider_id: UUID) -> list[ModelInfo]:
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        api_key = _safe_decrypt(provider.api_key_enc, provider.provider_name) if provider.api_key_enc else None
        models_raw = await llm_gateway.list_models(provider.provider_name, api_key, provider.base_url)
        return [ModelInfo(id=m["id"], name=m["name"]) for m in models_raw]

    async def test_connection(self, db: AsyncSession, provider_id: UUID) -> ConnectionTestResult:
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        api_key = _safe_decrypt(provider.api_key_enc, provider.provider_name) if provider.api_key_enc else None
        test_result = await llm_gateway.test_connection(
            provider.provider_name, api_key, provider.default_model, provider.base_url
        )
        return ConnectionTestResult(**test_result)


llm_service = LLMService()
