"""
LLM Integration Service

This module provides the integration layer for LLM providers.
It wraps the database persistence, LLM gateway, and provider-specific configurations.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import LLMProvider
from openforge.schemas.llm import (
    LLMProviderCreate,
    LLMProviderUpdate,
    LLMProviderResponse,
    ModelInfo,
    ConnectionTestResult,
)
from openforge.common.crypto import decrypt_value, encrypt_value
from openforge.core.llm_gateway import llm_gateway

logger = logging.getLogger("openforge.integrations.llm")


def _to_response(provider: LLMProvider) -> LLMProviderResponse:
    """Convert database model to response schema."""
    return LLMProviderResponse(
        id=provider.id,
        provider_name=provider.provider_name,
        display_name=provider.display_name,
        endpoint_id=provider.endpoint_id,
        base_url=provider.base_url,
        default_model=provider.default_model,
        enabled_models=provider.enabled_models,
        is_system_default=provider.is_system_default,
        has_api_key=provider.api_key_enc is not None,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


class LLMIntegrationService:
    """Service for managing LLM provider integrations."""

    async def create_provider(
        self,
        db: AsyncSession,
        data: LLMProviderCreate,
    ) -> LLMProviderResponse:
        """Create a new LLM provider configuration."""
        from sqlalchemy import select, func

        # Check if this is the first provider
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
        """List all LLM providers."""
        from sqlalchemy import select

        result = await db.execute(select(LLMProvider))
        return [_to_response(p) for p in result.scalars().all()]

    async def get_provider(
        self,
        db: AsyncSession,
        provider_id: UUID,
    ) -> LLMProviderResponse:
        """Get a specific LLM provider by ID."""
        from sqlalchemy import select
        from fastapi import HTTPException

        result = await db.execute(
            select(LLMProvider).where(LLMProvider.id == provider_id)
        )
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        return _to_response(provider)

    async def update_provider(
        self,
        db: AsyncSession,
        provider_id: UUID,
        data: LLMProviderUpdate,
    ) -> LLMProviderResponse:
        """Update an existing LLM provider configuration."""
        from sqlalchemy import select
        from fastapi import HTTPException

        result = await db.execute(
            select(LLMProvider).where(LLMProvider.id == provider_id)
        )
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

    async def delete_provider(self, db: AsyncSession, provider_id: UUID) -> None:
        """Delete an LLM provider configuration."""
        from sqlalchemy import select
        from fastapi import HTTPException

        result = await db.execute(
            select(LLMProvider).where(LLMProvider.id == provider_id)
        )
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        if provider.is_system_default:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete system default provider",
            )

        await db.delete(provider)
        await db.commit()

    async def test_connection(
        self,
        db: AsyncSession,
        provider_id: UUID,
    ) -> ConnectionTestResult:
        """Test connection to an LLM provider."""
        provider = await self.get_provider(db, provider_id)
        return await llm_gateway.test_connection(provider_id)

    async def list_models(self, db: AsyncSession, provider_id: UUID) -> list[ModelInfo]:
        """List available models for a provider."""
        provider = await self.get_provider(db, provider_id)
        return await llm_gateway.list_models(provider_id)

    async def get_decrypted_api_key(
        self,
        db: AsyncSession,
        provider_id: UUID,
    ) -> Optional[str]:
        """Get decrypted API key for a provider (internal use only)."""
        from sqlalchemy import select

        result = await db.execute(
            select(LLMProvider.api_key_enc).where(LLMProvider.id == provider_id)
        )
        api_key_enc = result.scalar_one_or_none()
        if api_key_enc is None:
            return None
        return decrypt_value(api_key_enc)


# Singleton instance
llm_integration_service = LLMIntegrationService()
