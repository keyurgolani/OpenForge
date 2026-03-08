from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional

from openforge.db.models import LLMProvider, LLMModel, LLMEndpoint, LLMVirtualProvider, Workspace, Config, Knowledge
from openforge.schemas.llm import (
    LLMProviderCreate,
    LLMProviderUpdate,
    LLMProviderResponse,
    EndpointCreate,
    EndpointResponse,
    VirtualProviderCreate,
    VirtualProviderUpdate,
    VirtualProviderResponse,
    ModelInfo,
    ConnectionTestResult,
    EmbeddingConfigUpdate,
    EmbeddingConfigResponse,
)
from openforge.utils.crypto import encrypt_value, decrypt_value
from openforge.core.llm_gateway import llm_gateway
from fastapi import HTTPException
import logging

logger = logging.getLogger("openforge.llm_service")


def _provider_to_response(provider: LLMProvider) -> LLMProviderResponse:
    models = []
    if hasattr(provider, 'models') and provider.models:
        models = [
            {
                "id": str(m.id),
                "model_id": m.model_id,
                "display_name": m.display_name or m.model_id,
                "capabilities": m.capabilities or [],
                "is_enabled": m.is_enabled,
            }
            for m in provider.models
        ]
    return LLMProviderResponse(
        id=provider.id,
        provider_name=provider.provider_name,
        display_name=provider.display_name,
        endpoint_id=provider.endpoint_id,
        base_url=provider.base_url,
        has_api_key=provider.api_key_enc is not None,
        models=models,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


def _endpoint_to_response(ep: LLMEndpoint) -> EndpointResponse:
    resp = EndpointResponse(
        id=ep.id,
        endpoint_type=ep.endpoint_type,
        display_name=ep.display_name,
        provider_id=ep.provider_id,
        model_id=ep.model_id,
        virtual_provider_id=ep.virtual_provider_id,
        is_default_chat=ep.is_default_chat,
        is_default_vision=ep.is_default_vision,
        is_default_tts=ep.is_default_tts,
        is_default_stt=ep.is_default_stt,
        created_at=ep.created_at,
    )
    if ep.provider:
        resp.provider_name = ep.provider.provider_name
        resp.provider_display_name = ep.provider.display_name
    if ep.virtual_provider:
        resp.virtual_type = ep.virtual_provider.virtual_type
        resp.virtual_display_name = ep.virtual_provider.display_name
    return resp


class LLMService:
    # ── Providers ─────────────────────────────────────────────────────────────

    async def create_provider(self, db: AsyncSession, data: LLMProviderCreate) -> LLMProviderResponse:
        provider = LLMProvider(
            provider_name=data.provider_name,
            display_name=data.display_name,
            endpoint_id=data.endpoint_id,
            base_url=data.base_url,
        )
        if data.api_key:
            provider.api_key_enc = encrypt_value(data.api_key)

        db.add(provider)
        await db.flush()

        # Create LLMModel entries and auto-create endpoints for enabled models
        is_first_endpoint = (await db.execute(select(func.count(LLMEndpoint.id)))).scalar() == 0
        first_endpoint_id = None

        for model_data in data.enabled_models:
            model = LLMModel(
                provider_id=provider.id,
                model_id=model_data["id"],
                display_name=model_data.get("name", model_data["id"]),
                capabilities=model_data.get("capabilities", ["chat"]),
                is_enabled=True,
            )
            db.add(model)

            # Auto-create an endpoint for each enabled model
            ep = LLMEndpoint(
                endpoint_type="standard",
                display_name=f"{data.display_name} / {model_data.get('name', model_data['id'])}",
                provider_id=provider.id,
                model_id=model_data["id"],
                is_default_chat=(is_first_endpoint and first_endpoint_id is None),
            )
            db.add(ep)
            await db.flush()
            if first_endpoint_id is None:
                first_endpoint_id = ep.id

        await db.commit()

        # Re-fetch with models loaded
        result = await db.execute(
            select(LLMProvider)
            .where(LLMProvider.id == provider.id)
            .options(selectinload(LLMProvider.models))
        )
        provider = result.scalar_one()
        return _provider_to_response(provider)

    async def list_providers(self, db: AsyncSession) -> list[LLMProviderResponse]:
        result = await db.execute(
            select(LLMProvider).options(selectinload(LLMProvider.models))
        )
        return [_provider_to_response(p) for p in result.scalars().all()]

    async def get_provider(self, db: AsyncSession, provider_id: UUID) -> LLMProviderResponse:
        result = await db.execute(
            select(LLMProvider)
            .where(LLMProvider.id == provider_id)
            .options(selectinload(LLMProvider.models))
        )
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        return _provider_to_response(provider)

    async def update_provider(self, db: AsyncSession, provider_id: UUID, data: LLMProviderUpdate) -> LLMProviderResponse:
        result = await db.execute(
            select(LLMProvider)
            .where(LLMProvider.id == provider_id)
            .options(selectinload(LLMProvider.models))
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
        if data.api_key is not None:
            provider.api_key_enc = encrypt_value(data.api_key)

        await db.commit()
        await db.refresh(provider)
        return _provider_to_response(provider)

    async def delete_provider(self, db: AsyncSession, provider_id: UUID):
        result = await db.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        await db.delete(provider)
        await db.commit()

    async def sync_models(self, db: AsyncSession, provider_id: UUID, models: list[dict]) -> LLMProviderResponse:
        """Sync discovered models: add new ones, update existing, remove missing."""
        result = await db.execute(
            select(LLMProvider)
            .where(LLMProvider.id == provider_id)
            .options(selectinload(LLMProvider.models))
        )
        provider = result.scalar_one_or_none()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")

        existing = {m.model_id: m for m in provider.models}
        incoming_ids = {m["id"] for m in models}

        # Add new models and auto-create endpoints
        for model_data in models:
            mid = model_data["id"]
            if mid not in existing:
                model = LLMModel(
                    provider_id=provider.id,
                    model_id=mid,
                    display_name=model_data.get("name", mid),
                    capabilities=model_data.get("capabilities", ["chat"]),
                    is_enabled=True,
                )
                db.add(model)
                # Auto-create endpoint
                ep = LLMEndpoint(
                    endpoint_type="standard",
                    display_name=f"{provider.display_name} / {model_data.get('name', mid)}",
                    provider_id=provider.id,
                    model_id=mid,
                )
                db.add(ep)

        # Disable models no longer available
        for mid, model in existing.items():
            if mid not in incoming_ids:
                model.is_enabled = False

        await db.commit()
        return await self.get_provider(db, provider_id)

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
        test_result = await llm_gateway.test_connection(provider.provider_name, api_key, base_url=provider.base_url)
        return ConnectionTestResult(**test_result)

    # ── Endpoints ─────────────────────────────────────────────────────────────

    async def list_endpoints(self, db: AsyncSession) -> list[EndpointResponse]:
        result = await db.execute(
            select(LLMEndpoint)
            .options(
                selectinload(LLMEndpoint.provider),
                selectinload(LLMEndpoint.virtual_provider),
            )
        )
        return [_endpoint_to_response(ep) for ep in result.scalars().all()]

    async def get_endpoint(self, db: AsyncSession, endpoint_id: UUID) -> EndpointResponse:
        result = await db.execute(
            select(LLMEndpoint)
            .where(LLMEndpoint.id == endpoint_id)
            .options(
                selectinload(LLMEndpoint.provider),
                selectinload(LLMEndpoint.virtual_provider),
            )
        )
        ep = result.scalar_one_or_none()
        if not ep:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        return _endpoint_to_response(ep)

    async def create_endpoint(self, db: AsyncSession, data: EndpointCreate) -> EndpointResponse:
        ep = LLMEndpoint(
            endpoint_type=data.endpoint_type,
            display_name=data.display_name,
            provider_id=data.provider_id,
            model_id=data.model_id,
            virtual_provider_id=data.virtual_provider_id,
        )
        db.add(ep)
        await db.commit()
        return await self.get_endpoint(db, ep.id)

    async def delete_endpoint(self, db: AsyncSession, endpoint_id: UUID):
        result = await db.execute(select(LLMEndpoint).where(LLMEndpoint.id == endpoint_id))
        ep = result.scalar_one_or_none()
        if not ep:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        await db.delete(ep)
        await db.commit()

    async def set_default_endpoint(self, db: AsyncSession, endpoint_id: UUID, purpose: str) -> EndpointResponse:
        """Set an endpoint as default for 'chat', 'vision', 'tts', or 'stt'."""
        flag_map = {
            "chat": "is_default_chat",
            "vision": "is_default_vision",
            "tts": "is_default_tts",
            "stt": "is_default_stt",
        }
        if purpose not in flag_map:
            raise HTTPException(status_code=400, detail=f"Invalid purpose: {purpose}")

        flag = flag_map[purpose]
        # Unset current default for this purpose
        current = await db.execute(select(LLMEndpoint).where(getattr(LLMEndpoint, flag) == True))
        for ep in current.scalars().all():
            setattr(ep, flag, False)

        result = await db.execute(select(LLMEndpoint).where(LLMEndpoint.id == endpoint_id))
        ep = result.scalar_one_or_none()
        if not ep:
            raise HTTPException(status_code=404, detail="Endpoint not found")
        setattr(ep, flag, True)

        await db.commit()
        return await self.get_endpoint(db, endpoint_id)

    async def get_endpoint_for_workspace(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        purpose: str = "chat",
        endpoint_override: Optional[UUID] = None,
    ) -> LLMEndpoint:
        """Resolve the endpoint for a workspace. Priority: override > workspace > system default."""
        if endpoint_override:
            result = await db.execute(
                select(LLMEndpoint)
                .where(LLMEndpoint.id == endpoint_override)
                .options(selectinload(LLMEndpoint.provider), selectinload(LLMEndpoint.virtual_provider))
            )
            ep = result.scalar_one_or_none()
            if ep:
                return ep

        # Workspace override
        ws_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = ws_result.scalar_one_or_none()

        if workspace:
            ep_id = workspace.chat_endpoint_id if purpose == "chat" else workspace.vision_endpoint_id
            if ep_id:
                result = await db.execute(
                    select(LLMEndpoint)
                    .where(LLMEndpoint.id == ep_id)
                    .options(selectinload(LLMEndpoint.provider), selectinload(LLMEndpoint.virtual_provider))
                )
                ep = result.scalar_one_or_none()
                if ep:
                    return ep

        # System default
        if purpose == "chat":
            result = await db.execute(
                select(LLMEndpoint)
                .where(LLMEndpoint.is_default_chat == True)
                .options(selectinload(LLMEndpoint.provider), selectinload(LLMEndpoint.virtual_provider))
            )
        else:
            result = await db.execute(
                select(LLMEndpoint)
                .where(LLMEndpoint.is_default_vision == True)
                .options(selectinload(LLMEndpoint.provider), selectinload(LLMEndpoint.virtual_provider))
            )
        ep = result.scalar_one_or_none()
        if ep:
            return ep

        # Last resort: any endpoint
        result = await db.execute(
            select(LLMEndpoint)
            .where(LLMEndpoint.endpoint_type == "standard")
            .options(selectinload(LLMEndpoint.provider))
            .limit(1)
        )
        ep = result.scalar_one_or_none()
        if not ep:
            raise HTTPException(status_code=400, detail="No LLM endpoint configured")
        return ep

    async def get_provider_for_workspace(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        provider_id: Optional[str] = None,
        model_override: Optional[str] = None,
    ) -> tuple[str, str, str, Optional[str], str]:
        """Legacy compatibility wrapper. Returns (provider_name, api_key, model, base_url, endpoint_type).

        Used by knowledge processing, conversation service, and other callers
        that need raw provider info for direct litellm calls.
        """
        from openforge.services.endpoint_resolver import endpoint_resolver

        endpoint_override = UUID(provider_id) if provider_id else None
        endpoint = await self.get_endpoint_for_workspace(db, workspace_id, endpoint_override=endpoint_override)

        if endpoint.endpoint_type != "standard":
            raise HTTPException(
                status_code=400,
                detail="Virtual endpoints cannot be used for direct model calls — use EndpointResolver instead",
            )

        info = await endpoint_resolver.resolve_provider_info(db, endpoint)
        model = model_override or info["model"]
        return info["provider_name"], info["api_key"], model, info["base_url"], "standard"

    # ── Virtual Providers ─────────────────────────────────────────────────────

    async def create_virtual_provider(self, db: AsyncSession, data: VirtualProviderCreate) -> VirtualProviderResponse:
        vp = LLMVirtualProvider(
            virtual_type=data.virtual_type,
            display_name=data.display_name,
            description=data.description,
        )
        db.add(vp)
        await db.flush()

        # Auto-create an endpoint for this virtual provider
        ep = LLMEndpoint(
            endpoint_type="virtual",
            display_name=data.display_name,
            virtual_provider_id=vp.id,
        )
        db.add(ep)
        await db.commit()
        await db.refresh(vp)

        return VirtualProviderResponse(
            id=vp.id,
            virtual_type=vp.virtual_type,
            display_name=vp.display_name,
            description=vp.description,
            endpoint_id=ep.id,
            created_at=vp.created_at,
            updated_at=vp.updated_at,
        )

    async def list_virtual_providers(self, db: AsyncSession) -> list[VirtualProviderResponse]:
        result = await db.execute(select(LLMVirtualProvider))
        vps = result.scalars().all()
        responses = []
        for vp in vps:
            # Find associated endpoint
            ep_result = await db.execute(
                select(LLMEndpoint).where(
                    LLMEndpoint.virtual_provider_id == vp.id,
                    LLMEndpoint.endpoint_type == "virtual",
                )
            )
            ep = ep_result.scalar_one_or_none()
            responses.append(VirtualProviderResponse(
                id=vp.id,
                virtual_type=vp.virtual_type,
                display_name=vp.display_name,
                description=vp.description,
                endpoint_id=ep.id if ep else None,
                created_at=vp.created_at,
                updated_at=vp.updated_at,
            ))
        return responses

    async def get_virtual_provider(self, db: AsyncSession, vp_id: UUID) -> VirtualProviderResponse:
        result = await db.execute(select(LLMVirtualProvider).where(LLMVirtualProvider.id == vp_id))
        vp = result.scalar_one_or_none()
        if not vp:
            raise HTTPException(status_code=404, detail="Virtual provider not found")
        ep_result = await db.execute(
            select(LLMEndpoint).where(
                LLMEndpoint.virtual_provider_id == vp.id,
                LLMEndpoint.endpoint_type == "virtual",
            )
        )
        ep = ep_result.scalar_one_or_none()
        return VirtualProviderResponse(
            id=vp.id,
            virtual_type=vp.virtual_type,
            display_name=vp.display_name,
            description=vp.description,
            endpoint_id=ep.id if ep else None,
            created_at=vp.created_at,
            updated_at=vp.updated_at,
        )

    async def update_virtual_provider(self, db: AsyncSession, vp_id: UUID, data: VirtualProviderUpdate) -> VirtualProviderResponse:
        result = await db.execute(select(LLMVirtualProvider).where(LLMVirtualProvider.id == vp_id))
        vp = result.scalar_one_or_none()
        if not vp:
            raise HTTPException(status_code=404, detail="Virtual provider not found")
        if data.display_name is not None:
            vp.display_name = data.display_name
        if data.description is not None:
            vp.description = data.description
        await db.commit()
        return await self.get_virtual_provider(db, vp_id)

    async def delete_virtual_provider(self, db: AsyncSession, vp_id: UUID):
        result = await db.execute(select(LLMVirtualProvider).where(LLMVirtualProvider.id == vp_id))
        vp = result.scalar_one_or_none()
        if not vp:
            raise HTTPException(status_code=404, detail="Virtual provider not found")
        await db.delete(vp)
        await db.commit()

    # ── Embedding Config ───────────────────────────────────────────────────────

    _EMBEDDING_CONFIG_KEY = "embedding.config"

    async def get_embedding_config(self, db: AsyncSession) -> EmbeddingConfigResponse:
        result = await db.execute(select(Config).where(Config.key == self._EMBEDDING_CONFIG_KEY))
        row = result.scalar_one_or_none()
        if not row:
            return EmbeddingConfigResponse(mode="native", native_model="all-MiniLM-L6-v2")
        data = row.value or {}
        return EmbeddingConfigResponse(
            mode=data.get("mode", "native"),
            native_model=data.get("native_model", "all-MiniLM-L6-v2"),
            provider_endpoint_id=data.get("provider_endpoint_id"),
        )

    async def set_embedding_config(self, db: AsyncSession, data: EmbeddingConfigUpdate) -> EmbeddingConfigResponse:
        if data.mode not in ("native", "provider"):
            raise HTTPException(status_code=400, detail="mode must be 'native' or 'provider'")
        if data.mode == "provider" and not data.provider_endpoint_id:
            raise HTTPException(status_code=400, detail="provider_endpoint_id is required when mode is 'provider'")

        config_value = {"mode": data.mode}
        if data.mode == "native":
            config_value["native_model"] = data.native_model or "all-MiniLM-L6-v2"
        else:
            config_value["provider_endpoint_id"] = str(data.provider_endpoint_id)

        result = await db.execute(select(Config).where(Config.key == self._EMBEDDING_CONFIG_KEY))
        row = result.scalar_one_or_none()
        if row:
            row.value = config_value
        else:
            db.add(Config(key=self._EMBEDDING_CONFIG_KEY, value=config_value, category="llm", sensitive=False))
        await db.commit()

        return EmbeddingConfigResponse(
            mode=config_value["mode"],
            native_model=config_value.get("native_model", "all-MiniLM-L6-v2"),
            provider_endpoint_id=config_value.get("provider_endpoint_id"),
        )

    async def reindex_all_embeddings(self, db: AsyncSession) -> dict:
        """Reset all knowledge embedding_status to 'pending' so they get re-embedded."""
        result = await db.execute(select(Knowledge))
        items = result.scalars().all()
        count = 0
        for item in items:
            item.embedding_status = "pending"
            count += 1
        await db.commit()
        return {"reset_count": count, "message": f"Reset {count} knowledge items to pending. They will be re-embedded on the next embedding run."}


llm_service = LLMService()
