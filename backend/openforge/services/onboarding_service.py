from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openforge.db.models import Onboarding
from openforge.schemas.settings import OnboardingState
from datetime import datetime, timezone
from fastapi import HTTPException
import logging

logger = logging.getLogger("openforge.onboarding")

VALID_TRANSITIONS = {
    "welcome": {"llm_setup"},
    "llm_setup": {"workspace_create"},
    # Allow "complete" for older onboarding clients that skip automation preferences.
    "workspace_create": {"automation_preferences", "complete"},
    "automation_preferences": {"complete"},
}


class OnboardingService:
    async def get_state(self, db: AsyncSession) -> OnboardingState:
        result = await db.execute(select(Onboarding))
        row = result.scalar_one_or_none()
        if not row:
            row = Onboarding(id=1)
            db.add(row)
            await db.commit()
            await db.refresh(row)
        return OnboardingState(
            is_complete=row.is_complete,
            current_step=row.current_step,
            completed_at=row.completed_at.isoformat() if row.completed_at else None,
        )

    async def advance_step(self, db: AsyncSession, step: str) -> OnboardingState:
        result = await db.execute(select(Onboarding))
        row = result.scalar_one_or_none()
        if not row:
            row = Onboarding(id=1)
            db.add(row)

        allowed_next = VALID_TRANSITIONS.get(row.current_step, set())
        if step not in allowed_next:
            expected = ", ".join(sorted(allowed_next)) if allowed_next else "none"
            raise HTTPException(
                status_code=400,
                detail=f"Invalid step transition. Expected one of [{expected}], got '{step}'.",
            )

        row.current_step = step
        if step == "complete":
            row.is_complete = True
            row.completed_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(row)
        return OnboardingState(
            is_complete=row.is_complete,
            current_step=row.current_step,
            completed_at=row.completed_at.isoformat() if row.completed_at else None,
        )


onboarding_service = OnboardingService()
