"""Add deployments table and runs.deployment_id.

Creates the deployments table for live, deployed instances of automations
with baked-in input values. Adds deployment_id FK column to runs.

Revision ID: 003_add_deployments
Revises: 002_wave3_drop
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003_add_deployments"
down_revision = "002_wave3_drop"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB
UUID = postgresql.UUID(as_uuid=True)
DT = sa.DateTime(timezone=True)
NOW = sa.text("now()")
EMPTY_OBJ = sa.text("'{}'::jsonb")


def upgrade() -> None:
    op.create_table(
        "deployments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("automation_id", UUID, sa.ForeignKey("automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_spec_id", UUID, sa.ForeignKey("compiled_agent_specs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deployed_by", sa.String(255), nullable=True),
        sa.Column("input_values", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("trigger_id", UUID, sa.ForeignKey("trigger_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_run_id", UUID, nullable=True),
        sa.Column("last_run_at", DT, nullable=True),
        sa.Column("last_success_at", DT, nullable=True),
        sa.Column("last_failure_at", DT, nullable=True),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.Column("updated_at", DT, nullable=False, server_default=NOW),
        sa.Column("torn_down_at", DT, nullable=True),
    )
    op.create_index("ix_deployments_automation_id", "deployments", ["automation_id"])
    op.create_index("ix_deployments_workspace_id", "deployments", ["workspace_id"])
    op.create_index("ix_deployments_agent_spec_id", "deployments", ["agent_spec_id"])
    op.create_index("ix_deployments_status", "deployments", ["status"])

    op.add_column(
        "runs",
        sa.Column("deployment_id", UUID, sa.ForeignKey("deployments.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_runs_deployment_id", "runs", ["deployment_id"])


def downgrade() -> None:
    op.drop_index("ix_runs_deployment_id", table_name="runs")
    op.drop_column("runs", "deployment_id")
    op.drop_table("deployments")
