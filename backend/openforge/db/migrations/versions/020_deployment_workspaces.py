"""Add deployment workspace ownership fields.

Workspaces gain ownership_type, owner_deployment_id, is_readonly_ui, auto_teardown.
Deployments gain owned_workspace_id and workspace_provisioning.

Revision ID: 020_deployment_workspaces
Revises: 019_rename_agent_mode_column
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "020_deployment_workspaces"
down_revision = "019_rename_agent_mode_column"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Workspace ownership columns ---
    op.add_column(
        "workspaces",
        sa.Column("ownership_type", sa.String(20), nullable=False, server_default="user",
                   comment="'user' = normal user workspace, 'deployment' = owned by a deployment"),
    )
    op.add_column(
        "workspaces",
        sa.Column("owner_deployment_id", UUID(as_uuid=True), nullable=True,
                   comment="If ownership_type='deployment', the deployment that owns this workspace"),
    )
    op.add_column(
        "workspaces",
        sa.Column("is_readonly_ui", sa.Boolean(), nullable=False, server_default=sa.text("false"),
                   comment="If true, UI prevents user edits"),
    )
    op.add_column(
        "workspaces",
        sa.Column("auto_teardown", sa.Boolean(), nullable=False, server_default=sa.text("true"),
                   comment="If true, workspace is deleted when owning deployment is torn down"),
    )

    op.create_foreign_key(
        "fk_workspaces_owner_deployment_id",
        "workspaces", "deployments",
        ["owner_deployment_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_workspaces_owner_deployment_id", "workspaces", ["owner_deployment_id"])
    op.create_index("idx_workspaces_ownership", "workspaces", ["ownership_type", "owner_deployment_id"])

    # --- Deployment workspace columns ---
    op.add_column(
        "deployments",
        sa.Column("owned_workspace_id", UUID(as_uuid=True), nullable=True,
                   comment="Optional workspace owned by this deployment for cross-run knowledge sharing"),
    )
    op.add_column(
        "deployments",
        sa.Column("workspace_provisioning", sa.String(20), nullable=False, server_default="none",
                   comment="'none' = no workspace, 'auto' = create on deploy"),
    )

    op.create_foreign_key(
        "fk_deployments_owned_workspace_id",
        "deployments", "workspaces",
        ["owned_workspace_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_deployments_owned_workspace", "deployments", ["owned_workspace_id"])


def downgrade() -> None:
    op.drop_index("idx_deployments_owned_workspace", table_name="deployments")
    op.drop_constraint("fk_deployments_owned_workspace_id", "deployments", type_="foreignkey")
    op.drop_column("deployments", "workspace_provisioning")
    op.drop_column("deployments", "owned_workspace_id")

    op.drop_index("idx_workspaces_ownership", table_name="workspaces")
    op.drop_index("idx_workspaces_owner_deployment_id", table_name="workspaces")
    op.drop_constraint("fk_workspaces_owner_deployment_id", "workspaces", type_="foreignkey")
    op.drop_column("workspaces", "auto_teardown")
    op.drop_column("workspaces", "is_readonly_ui")
    op.drop_column("workspaces", "owner_deployment_id")
    op.drop_column("workspaces", "ownership_type")
