"""Prompt domain API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import (
    PromptCreate,
    PromptListResponse,
    PromptPreviewRequest,
    PromptPreviewResponse,
    PromptResponse,
    PromptUpdate,
    PromptVersionResponse,
)
from .service import PromptService
from .types import PromptRenderError

router = APIRouter()


def get_prompt_service(db=Depends(get_db)) -> PromptService:
    return PromptService(db)


@router.get("", response_model=PromptListResponse)
async def list_prompts(
    skip: int = 0,
    limit: int = 100,
    service: PromptService = Depends(get_prompt_service),
):
    prompts, total = await service.list_prompts(skip=skip, limit=limit)
    return {"prompts": prompts, "total": total}


@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(prompt_id: UUID, service: PromptService = Depends(get_prompt_service)):
    prompt = await service.get_prompt(prompt_id)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return prompt


@router.post("", response_model=PromptResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt(prompt_data: PromptCreate, service: PromptService = Depends(get_prompt_service)):
    return await service.create_prompt(prompt_data.model_dump())


@router.patch("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: UUID,
    prompt_data: PromptUpdate,
    service: PromptService = Depends(get_prompt_service),
):
    prompt = await service.update_prompt(prompt_id, prompt_data.model_dump(exclude_unset=True))
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return prompt


@router.get("/{prompt_id}/versions", response_model=list[PromptVersionResponse])
async def list_prompt_versions(prompt_id: UUID, service: PromptService = Depends(get_prompt_service)):
    return await service.list_versions(prompt_id)


@router.post("/{prompt_id}/preview", response_model=PromptPreviewResponse)
async def preview_prompt(
    prompt_id: UUID,
    body: PromptPreviewRequest,
    service: PromptService = Depends(get_prompt_service),
):
    try:
        return await service.preview_prompt(prompt_id, version=body.version, variables=body.variables)
    except PromptRenderError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "reason_code": exc.reason_code,
                "message": str(exc),
                "details": exc.details,
            },
        ) from exc
