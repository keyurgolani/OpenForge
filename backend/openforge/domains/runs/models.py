"""
Run domain database models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.openforge.db.base import Base
from backend.openforge.domains.common.enums import ExecutionStatus

from .types import RunType


class RunModel(Base):
    """Database model for Runs."""

    __tablename__ = "runs"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    run_type: Mapped[RunType] = mapped_column(String(50), nullable=False)
    workflow_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True, index=True)
    mission_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True, index=True)
    parent_run_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True, index=True)
    workspace_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    status: Mapped[ExecutionStatus] = mapped_column(String(50), default=ExecutionStatus.PENDING)
    state_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    input_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    output_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
