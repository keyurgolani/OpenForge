"""Make agent_executions.workspace_id nullable for global chat.

Global (workspace-agnostic) conversations don't belong to any workspace,
so agent executions spawned from them should not require a workspace_id.

Revision ID: 006_nullable_execution_workspace
Revises: 005_global_agent_chat
Create Date: 2026-03-20
"""
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "006_nullable_execution_workspace"
down_revision = "005_global_agent_chat"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.alter_column(
        "agent_executions", "workspace_id",
        existing_type=UUID, nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "agent_executions", "workspace_id",
        existing_type=UUID, nullable=False,
    )
