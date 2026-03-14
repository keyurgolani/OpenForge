"""
Workflow domain database models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.openforge.db.base import Base

from .types import WorkflowStatus


class WorkflowDefinitionModel(Base):
    """Database model for Workflow Definitions."""

    __tablename__ = "workflow_definitions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    entry_node: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    nodes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    edges: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    default_input_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    default_output_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[WorkflowStatus] = mapped_column(String(50), default=WorkflowStatus.DRAFT)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    updated_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
