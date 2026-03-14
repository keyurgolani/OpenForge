"""
Mission domain database models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.openforge.db.base import Base
from backend.openforge.domains.common.enums import ExecutionMode

from .types import MissionStatus


class MissionDefinitionModel(Base):
    """Database model for Mission Definitions."""

    __tablename__ = "mission_definitions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    workflow_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    default_profile_ids: Mapped[list[UUID]] = mapped_column(ARRAY(Uuid), default=list)
    default_trigger_ids: Mapped[list[UUID]] = mapped_column(ARRAY(Uuid), default=list)
    autonomy_mode: Mapped[ExecutionMode] = mapped_column(String(50), default=ExecutionMode.SUPERVISED)
    approval_policy_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    budget_policy_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    output_artifact_types: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    status: Mapped[MissionStatus] = mapped_column(String(50), default=MissionStatus.DRAFT)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    updated_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
