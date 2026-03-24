"""Add automation graph tables and extend existing models.

Creates automation_nodes, automation_edges, automation_node_inputs tables.
Makes automations.agent_id nullable, adds automations.graph_version,
compiled_automation_specs.graph_snapshot, compiled_automation_specs.node_specs,
and deployments.automation_spec_id.

Revision ID: 004_automation_graph
Revises: 003_add_deployments
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004_automation_graph"
down_revision = "003_add_deployments"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB
UUID = postgresql.UUID(as_uuid=True)
DT = sa.DateTime(timezone=True)
NOW = sa.text("now()")
EMPTY_OBJ = sa.text("'{}'::jsonb")


def upgrade() -> None:
    # --- Alter automations ---
    op.alter_column("automations", "agent_id", existing_type=UUID, nullable=True)
    op.add_column("automations", sa.Column("graph_version", sa.Integer(), nullable=False, server_default="0"))

    # --- Alter compiled_automation_specs ---
    op.add_column("compiled_automation_specs", sa.Column("graph_snapshot", JSONB, nullable=False, server_default=EMPTY_OBJ))
    op.add_column("compiled_automation_specs", sa.Column("node_specs", JSONB, nullable=False, server_default=EMPTY_OBJ))

    # --- Alter deployments ---
    op.add_column("deployments", sa.Column(
        "automation_spec_id", UUID,
        sa.ForeignKey("compiled_automation_specs.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index("ix_deployments_automation_spec_id", "deployments", ["automation_spec_id"])

    # --- Create automation_nodes ---
    op.create_table(
        "automation_nodes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("automation_id", UUID, sa.ForeignKey("automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_key", sa.String(120), nullable=False),
        sa.Column("position_x", sa.Float(), nullable=False, server_default="0"),
        sa.Column("position_y", sa.Float(), nullable=False, server_default="0"),
        sa.Column("config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.Column("updated_at", DT, nullable=False, server_default=NOW),
        sa.UniqueConstraint("automation_id", "node_key", name="uq_automation_nodes_automation_node_key"),
    )
    op.create_index("ix_automation_nodes_automation_id", "automation_nodes", ["automation_id"])

    # --- Create automation_edges ---
    op.create_table(
        "automation_edges",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("automation_id", UUID, sa.ForeignKey("automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_node_id", UUID, sa.ForeignKey("automation_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_output_key", sa.String(100), nullable=False, server_default="output"),
        sa.Column("target_node_id", UUID, sa.ForeignKey("automation_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_input_key", sa.String(100), nullable=False),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.UniqueConstraint("automation_id", "target_node_id", "target_input_key", name="uq_automation_edges_target_input"),
    )
    op.create_index("ix_automation_edges_automation_id", "automation_edges", ["automation_id"])

    # --- Create automation_node_inputs ---
    op.create_table(
        "automation_node_inputs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("automation_id", UUID, sa.ForeignKey("automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", UUID, sa.ForeignKey("automation_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("input_key", sa.String(100), nullable=False),
        sa.Column("static_value", JSONB, nullable=True),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.UniqueConstraint("node_id", "input_key", name="uq_automation_node_inputs_node_input"),
    )
    op.create_index("ix_automation_node_inputs_automation_id", "automation_node_inputs", ["automation_id"])


def downgrade() -> None:
    op.drop_table("automation_node_inputs")
    op.drop_table("automation_edges")
    op.drop_table("automation_nodes")
    op.drop_index("ix_deployments_automation_spec_id", table_name="deployments")
    op.drop_column("deployments", "automation_spec_id")
    op.drop_column("compiled_automation_specs", "node_specs")
    op.drop_column("compiled_automation_specs", "graph_snapshot")
    op.drop_column("automations", "graph_version")
    op.alter_column("automations", "agent_id", existing_type=UUID, nullable=False)
