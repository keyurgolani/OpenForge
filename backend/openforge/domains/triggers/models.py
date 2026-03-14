"""
Trigger domain database models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.openforge.db.base import Base
from backend.openforge.domains.common.enums import TriggerType

from .types import TriggerStatus, TriggerTargetType


class TriggerDefinitionModel(Base):
    """Database model for Trigger Definitions."""

    __tablename__ = "trigger_definitions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_type: Mapped[TriggerType] = mapped_column(String(50), nullable=False)
    target_type: Mapped[TriggerTargetType] = mapped_column(String(50), nullable=False)
    target_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    schedule_expression: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payload_template: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[TriggerStatus] = mapped_column(String(50), default=TriggerStatus.DRAFT)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    updated_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
