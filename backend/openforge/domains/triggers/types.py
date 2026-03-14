"""
Trigger domain types.

This module defines the core types and enums for Trigger Definitions.
"""

from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from openforge.domains.common.enums import TriggerType


class TriggerStatus(str, Enum):
    """Status of a trigger definition."""

    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class TriggerTargetType(str, Enum):
    """Types of entities that can be triggered."""

    MISSION = "mission"
    WORKFLOW = "workflow"


class TriggerDefinition(BaseModel):
    """
    Trigger Definition - an automation rule.

    A Trigger defines when and how missions or workflows are automatically executed.

    Attributes:
        id: Unique identifier
        name: Display name
        trigger_type: Type of trigger (schedule/event/webhook/manual)
        target_type: Type of entity being triggered
        target_id: ID of the target mission or workflow
        schedule_expression: Cron expression for schedule triggers
        payload_template: Template for trigger payload
        is_enabled: Whether this trigger is active
        status: Current status
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: User who created this trigger
        updated_by: User who last updated this trigger
    """

    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    trigger_type: TriggerType = Field(...)
    target_type: TriggerTargetType = Field(...)
    target_id: UUID = Field(...)
    schedule_expression: Optional[str] = Field(default=None, max_length=100)
    payload_template: Optional[dict] = Field(default=None)
    is_enabled: bool = Field(default=True)
    status: TriggerStatus = Field(default=TriggerStatus.DRAFT)

    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)

    class Config:
        from_attributes = True
