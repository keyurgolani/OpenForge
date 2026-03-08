"""API endpoints for LLM virtual provider configs: router, council, optimizer."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from openforge.db.postgres import get_db
from openforge.services.llm_router_service import llm_router_service
from openforge.services.llm_council_service import llm_council_service
from openforge.services.llm_optimizer_service import llm_optimizer_service
from openforge.schemas.llm import (
    RouterConfigCreate,
    CouncilConfigCreate,
    OptimizerConfigCreate,
)

router = APIRouter(prefix="/llm/virtual", tags=["llm-virtual-providers"])


# ── Router Config Endpoints ──────────────────────────────────────────────────

@router.get("/{vp_id}/router-config")
async def get_router_config(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    config = await llm_router_service.get_config(db, vp_id)
    if not config:
        raise HTTPException(404, "Router config not found")
    return config


@router.post("/{vp_id}/router-config")
async def create_router_config(vp_id: UUID, body: RouterConfigCreate, db: AsyncSession = Depends(get_db)):
    config = await llm_router_service.create_config(
        db,
        virtual_provider_id=vp_id,
        routing_endpoint_id=body.routing_endpoint_id,
        routing_prompt=body.routing_prompt,
        tiers=[t.model_dump() for t in body.tiers],
    )
    return config


@router.put("/{vp_id}/router-config")
async def update_router_config(vp_id: UUID, body: dict, db: AsyncSession = Depends(get_db)):
    config = await llm_router_service.update_config(db, vp_id, **body)
    if not config:
        raise HTTPException(404, "Router config not found")
    return config


@router.delete("/{vp_id}/router-config", status_code=204)
async def delete_router_config(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    await llm_router_service.delete_config(db, vp_id)


# ── Council Config Endpoints ─────────────────────────────────────────────────

@router.get("/{vp_id}/council-config")
async def get_council_config(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    config = await llm_council_service.get_config(db, vp_id)
    if not config:
        raise HTTPException(404, "Council config not found")
    return config


@router.post("/{vp_id}/council-config")
async def create_council_config(vp_id: UUID, body: CouncilConfigCreate, db: AsyncSession = Depends(get_db)):
    config = await llm_council_service.create_config(
        db,
        virtual_provider_id=vp_id,
        chairman_endpoint_id=body.chairman_endpoint_id,
        parallel_execution=body.parallel_execution,
        judging_prompt=body.judging_prompt,
        members=[m.model_dump() for m in body.members],
    )
    return config


@router.put("/{vp_id}/council-config")
async def update_council_config(vp_id: UUID, body: dict, db: AsyncSession = Depends(get_db)):
    config = await llm_council_service.update_config(db, vp_id, **body)
    if not config:
        raise HTTPException(404, "Council config not found")
    return config


@router.delete("/{vp_id}/council-config", status_code=204)
async def delete_council_config(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    await llm_council_service.delete_config(db, vp_id)


# ── Optimizer Config Endpoints ────────────────────────────────────────────────

@router.get("/{vp_id}/optimizer-config")
async def get_optimizer_config(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    config = await llm_optimizer_service.get_config(db, vp_id)
    if not config:
        raise HTTPException(404, "Optimizer config not found")
    return config


@router.post("/{vp_id}/optimizer-config")
async def create_optimizer_config(vp_id: UUID, body: OptimizerConfigCreate, db: AsyncSession = Depends(get_db)):
    config = await llm_optimizer_service.create_config(
        db,
        virtual_provider_id=vp_id,
        optimizer_endpoint_id=body.optimizer_endpoint_id,
        target_endpoint_id=body.target_endpoint_id,
        optimization_prompt=body.optimization_prompt,
        additional_context=body.additional_context,
    )
    return config


@router.put("/{vp_id}/optimizer-config")
async def update_optimizer_config(vp_id: UUID, body: dict, db: AsyncSession = Depends(get_db)):
    config = await llm_optimizer_service.update_config(db, vp_id, **body)
    if not config:
        raise HTTPException(404, "Optimizer config not found")
    return config


@router.delete("/{vp_id}/optimizer-config", status_code=204)
async def delete_optimizer_config(vp_id: UUID, db: AsyncSession = Depends(get_db)):
    await llm_optimizer_service.delete_config(db, vp_id)
