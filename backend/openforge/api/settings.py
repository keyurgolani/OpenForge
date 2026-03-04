from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from openforge.db.postgres import get_db
from openforge.services.config_service import config_service
from openforge.services.onboarding_service import onboarding_service
from openforge.schemas.settings import ConfigItem, ConfigUpdate, OnboardingState, OnboardingStepAdvance

router = APIRouter()
onboarding_router = APIRouter()


@router.get("", response_model=list[ConfigItem])
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await config_service.get_all_config(db)


@router.put("/{key}", response_model=ConfigItem)
async def update_setting(
    key: str,
    body: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await config_service.set_config(
        db, key, body.value, body.category, body.sensitive
    )


@router.get("/needs-restart")
async def check_needs_restart(db: AsyncSession = Depends(get_db)):
    needs_restart = await config_service.check_needs_restart(db)
    return {"needs_restart": needs_restart}


@onboarding_router.get("", response_model=OnboardingState)
async def get_onboarding_state(db: AsyncSession = Depends(get_db)):
    return await onboarding_service.get_state(db)


@onboarding_router.post("/step", response_model=OnboardingState)
async def advance_onboarding(
    body: OnboardingStepAdvance,
    db: AsyncSession = Depends(get_db),
):
    return await onboarding_service.advance_step(db, body.step)
