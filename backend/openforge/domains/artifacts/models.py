"""
Artifact domain database models.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.openforge.db.base import Base
from backend.openforge.domains.common.enums import ArtifactType

from .types import ArtifactStatus


class ArtifactModel(Base):
    """Database model for Artifacts."""

    __tablename__ = "artifacts"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    artifact_type: Mapped[ArtifactType] = mapped_column(String(50), nullable=False)
    workspace_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    source_run_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True, index=True)
    source_mission_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[ArtifactStatus] = mapped_column(String(50), default=ArtifactStatus.DRAFT)
    version: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    updated_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
