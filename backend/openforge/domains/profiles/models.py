"""
Profile domain database models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.openforge.db.base import Base

from .types import ProfileRole, ProfileStatus


class AgentProfileModel(Base):
    """Database model for Agent Profiles."""

    __tablename__ = "agent_profiles"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role: Mapped[ProfileRole] = mapped_column(String(50), default=ProfileRole.ASSISTANT)
    system_prompt_ref: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    model_policy_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    memory_policy_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    safety_policy_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    capability_bundle_ids: Mapped[list[UUID]] = mapped_column(default=list)
    output_contract_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[ProfileStatus] = mapped_column(String(50), default=ProfileStatus.DRAFT)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    updated_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
