"""Onboarding state management for the common/config boundary."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import Onboarding
from openforge.schemas.settings import OnboardingState

_STEP_ORDER = (
    "welcome",
    "providers_setup",
    "workspace_create",
    "complete",
)

# Steps from the old 12-step flow that are no longer used.
# If a user is on one of these, redirect them forward.
_LEGACY_STEPS = {
    "models_chat", "models_vision", "models_embedding",
    "models_stt", "models_tts", "models_clip", "models_pdf",
    "automation_preferences",
}

# Build transitions: each step can go forward or backward one step.
# Model steps (except chat) can also skip forward to the next step.
_VALID_TRANSITIONS: dict[str, set[str]] = {}
for _i, _step in enumerate(_STEP_ORDER):
    _targets: set[str] = set()
    if _i > 0:
        _targets.add(_STEP_ORDER[_i - 1])  # backward
    if _i < len(_STEP_ORDER) - 1:
        _targets.add(_STEP_ORDER[_i + 1])  # forward
    _VALID_TRANSITIONS[_step] = _targets
# complete is terminal
_VALID_TRANSITIONS["complete"] = set()


class OnboardingService:
    async def get_state(self, db: AsyncSession) -> OnboardingState:
        state = await self._get_or_create_state(db)
        return self._serialize(state)

    async def advance_step(self, db: AsyncSession, step: str) -> OnboardingState:
        normalized_step = step.strip()
        if normalized_step not in _STEP_ORDER:
            raise HTTPException(status_code=400, detail=f"Unknown onboarding step: {step}")

        state = await self._get_or_create_state(db)
        if state.is_complete and normalized_step == "complete":
            return self._serialize(state)

        current_step = state.current_step or "welcome"

        # Handle users stuck on legacy steps from the old 12-step flow
        if current_step in _LEGACY_STEPS:
            current_step = "workspace_create"
            state.current_step = current_step

        if normalized_step != current_step and normalized_step not in _VALID_TRANSITIONS.get(current_step, set()):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid onboarding transition from '{current_step}' to '{normalized_step}'",
            )

        state.current_step = normalized_step
        if normalized_step == "complete":
            state.is_complete = True
            state.completed_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(state)
        return self._serialize(state)

    async def _get_or_create_state(self, db: AsyncSession) -> Onboarding:
        result = await db.execute(select(Onboarding).where(Onboarding.id == 1))
        state = result.scalar_one_or_none()
        if state is None:
            state = Onboarding(id=1, is_complete=False, current_step="welcome")
            db.add(state)
            await db.commit()
            await db.refresh(state)
        return state

    @staticmethod
    def _serialize(state: Onboarding) -> OnboardingState:
        return OnboardingState(
            is_complete=state.is_complete,
            current_step=state.current_step,
            completed_at=state.completed_at.isoformat() if state.completed_at else None,
        )


onboarding_service = OnboardingService()
