from pydantic import BaseModel, ConfigDict
from typing import Any, Optional


class ConfigItem(BaseModel):
    key: str
    value: Any
    category: str

    model_config = ConfigDict(from_attributes=True)


class ConfigUpdate(BaseModel):
    value: Any
    category: str = "general"
    sensitive: bool = False


class OnboardingState(BaseModel):
    is_complete: bool
    current_step: str
    completed_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OnboardingStepAdvance(BaseModel):
    step: str
