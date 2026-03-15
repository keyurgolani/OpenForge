"""Phase 12 Curated Catalog Metadata

Revision ID: 011_phase12_catalog_metadata
Revises: 010_phase11_missions_triggers
Create Date: 2026-03-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "011_phase12_catalog_metadata"
down_revision = "010_phase11_missions_triggers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── AgentProfile catalog columns ──
    op.add_column("agent_profiles", sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False))
    op.add_column("agent_profiles", sa.Column("catalog_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False))
    op.add_column("agent_profiles", sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("agent_profiles", sa.Column("is_recommended", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("agent_profiles", sa.Column("sort_priority", sa.Integer(), server_default="0", nullable=False))

    # ── WorkflowDefinition catalog columns ──
    op.add_column("workflow_definitions", sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False))
    op.add_column("workflow_definitions", sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("workflow_definitions", sa.Column("is_recommended", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("workflow_definitions", sa.Column("sort_priority", sa.Integer(), server_default="0", nullable=False))
    op.add_column("workflow_definitions", sa.Column("icon", sa.String(100), nullable=True))

    # ── MissionDefinition catalog columns ──
    op.add_column("mission_definitions", sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False))
    op.add_column("mission_definitions", sa.Column("catalog_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False))
    op.add_column("mission_definitions", sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mission_definitions", sa.Column("is_recommended", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mission_definitions", sa.Column("sort_priority", sa.Integer(), server_default="0", nullable=False))
    op.add_column("mission_definitions", sa.Column("icon", sa.String(100), nullable=True))

    # ── Indexes for catalog filtering ──
    op.create_index("idx_agent_profiles_is_system_template", "agent_profiles", ["is_system", "is_template"])
    op.create_index("idx_agent_profiles_is_featured", "agent_profiles", ["is_featured"], postgresql_where=sa.text("is_featured = true"))
    op.create_index("idx_workflow_definitions_is_featured", "workflow_definitions", ["is_featured"], postgresql_where=sa.text("is_featured = true"))
    op.create_index("idx_mission_definitions_is_system_template", "mission_definitions", ["is_system", "is_template"])
    op.create_index("idx_mission_definitions_is_featured", "mission_definitions", ["is_featured"], postgresql_where=sa.text("is_featured = true"))


def downgrade() -> None:
    op.drop_index("idx_mission_definitions_is_featured", "mission_definitions")
    op.drop_index("idx_mission_definitions_is_system_template", "mission_definitions")
    op.drop_index("idx_workflow_definitions_is_featured", "workflow_definitions")
    op.drop_index("idx_agent_profiles_is_featured", "agent_profiles")
    op.drop_index("idx_agent_profiles_is_system_template", "agent_profiles")

    op.drop_column("mission_definitions", "icon")
    op.drop_column("mission_definitions", "sort_priority")
    op.drop_column("mission_definitions", "is_recommended")
    op.drop_column("mission_definitions", "is_featured")
    op.drop_column("mission_definitions", "catalog_metadata")
    op.drop_column("mission_definitions", "tags")

    op.drop_column("workflow_definitions", "icon")
    op.drop_column("workflow_definitions", "sort_priority")
    op.drop_column("workflow_definitions", "is_recommended")
    op.drop_column("workflow_definitions", "is_featured")
    op.drop_column("workflow_definitions", "tags")

    op.drop_column("agent_profiles", "sort_priority")
    op.drop_column("agent_profiles", "is_recommended")
    op.drop_column("agent_profiles", "is_featured")
    op.drop_column("agent_profiles", "catalog_metadata")
    op.drop_column("agent_profiles", "tags")
