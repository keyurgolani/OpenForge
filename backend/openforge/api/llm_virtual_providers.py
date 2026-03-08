"""API endpoints for LLM virtual providers: router, council, and optimizer configs."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional

from openforge.db.postgres import get_db
from openforge.services.llm_router_service import llm_router_service
from openforge.services.llm_council_service import llm_council_service
from openforge.services.llm_optimizer_service import llm_optimizer_service

router = APIRouter(prefix="/llm/virtual", tags=["llm-virtual-providers"])


# ── Router Config Endpoints ────────────────────────────────────────────────────

@router.get("/{provider_id}/router-config")
async def get_router_config(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get router config for a provider."""
    config = await llm_router_service.get_config(db, provider_id)
    if not config:
        raise HTTPException(404, "Router config not found for this provider")
    return config


@router.post("/{provider_id}/router-config")
async def create_router_config(
    provider_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Create router config for a provider."""
    try:
        routing_model_provider_id = UUID(body["routing_model_provider_id"])
        routing_model = body["routing_model"]
        routing_prompt = body.get("routing_prompt")
        tiers = body.get("tiers", [])
        config = await llm_router_service.create_config(
            db,
            provider_id=provider_id,
            routing_model_provider_id=routing_model_provider_id,
            routing_model=routing_model,
            routing_prompt=routing_prompt,
            tiers=tiers,
        )
        return config
    except KeyError as e:
        raise HTTPException(400, f"Missing required field: {e}")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{provider_id}/router-config")
async def update_router_config(
    provider_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update router config for a provider."""
    config = await llm_router_service.update_config(db, provider_id, **body)
    if not config:
        raise HTTPException(404, "Router config not found for this provider")
    return config


@router.delete("/{provider_id}/router-config", status_code=204)
async def delete_router_config(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete router config for a provider."""
    await llm_router_service.delete_config(db, provider_id)


# ── Council Config Endpoints ───────────────────────────────────────────────────

@router.get("/{provider_id}/council-config")
async def get_council_config(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get council config for a provider."""
    config = await llm_council_service.get_config(db, provider_id)
    if not config:
        raise HTTPException(404, "Council config not found for this provider")
    return config


@router.post("/{provider_id}/council-config")
async def create_council_config(
    provider_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Create council config for a provider."""
    try:
        chairman_provider_id = UUID(body["chairman_provider_id"])
        chairman_model = body["chairman_model"]
        parallel_execution = body.get("parallel_execution", True)
        judging_prompt = body.get("judging_prompt")
        members = body.get("members", [])
        config = await llm_council_service.create_config(
            db,
            provider_id=provider_id,
            chairman_provider_id=chairman_provider_id,
            chairman_model=chairman_model,
            parallel_execution=parallel_execution,
            judging_prompt=judging_prompt,
            members=members,
        )
        return config
    except KeyError as e:
        raise HTTPException(400, f"Missing required field: {e}")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{provider_id}/council-config")
async def update_council_config(
    provider_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update council config for a provider."""
    config = await llm_council_service.update_config(db, provider_id, **body)
    if not config:
        raise HTTPException(404, "Council config not found for this provider")
    return config


@router.delete("/{provider_id}/council-config", status_code=204)
async def delete_council_config(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete council config for a provider."""
    await llm_council_service.delete_config(db, provider_id)


# ── Optimizer Config Endpoints ─────────────────────────────────────────────────

@router.get("/{provider_id}/optimizer-config")
async def get_optimizer_config(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get optimizer config for a provider."""
    config = await llm_optimizer_service.get_config(db, provider_id)
    if not config:
        raise HTTPException(404, "Optimizer config not found for this provider")
    return config


@router.post("/{provider_id}/optimizer-config")
async def create_optimizer_config(
    provider_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Create optimizer config for a provider."""
    try:
        config = await llm_optimizer_service.create_config(
            db,
            provider_id=provider_id,
            optimizer_provider_id=UUID(body["optimizer_provider_id"]),
            optimizer_model=body["optimizer_model"],
            target_provider_id=UUID(body["target_provider_id"]),
            target_model=body["target_model"],
            optimization_prompt=body.get("optimization_prompt"),
            additional_context=body.get("additional_context"),
        )
        return config
    except KeyError as e:
        raise HTTPException(400, f"Missing required field: {e}")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{provider_id}/optimizer-config")
async def update_optimizer_config(
    provider_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update optimizer config for a provider."""
    config = await llm_optimizer_service.update_config(db, provider_id, **body)
    if not config:
        raise HTTPException(404, "Optimizer config not found for this provider")
    return config


@router.delete("/{provider_id}/optimizer-config", status_code=204)
async def delete_optimizer_config(provider_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete optimizer config for a provider."""
    await llm_optimizer_service.delete_config(db, provider_id)
