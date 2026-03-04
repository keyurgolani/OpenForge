"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # config table
    op.create_table(
        "config",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="general"),
        sa.Column("sensitive", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # llm_providers table
    op.create_table(
        "llm_providers",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("provider_name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("api_key_enc", sa.LargeBinary(), nullable=True),
        sa.Column("endpoint_id", sa.String(50), nullable=False, server_default="default"),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("default_model", sa.String(200), nullable=True),
        sa.Column("is_system_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "idx_llm_providers_system_default",
        "llm_providers",
        ["is_system_default"],
        unique=True,
        postgresql_where=sa.text("is_system_default = TRUE"),
    )

    # workspaces table
    op.create_table(
        "workspaces",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column(
            "llm_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("llm_model", sa.String(200), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # notes table
    op.create_table(
        "notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(20), nullable=False, server_default="standard"),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("url_title", sa.String(500), nullable=True),
        sa.Column("url_description", sa.Text(), nullable=True),
        sa.Column("gist_language", sa.String(50), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("insights", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ai_title", sa.String(500), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("embedding_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_notes_workspace", "notes", ["workspace_id"])
    op.create_index("idx_notes_type", "notes", ["workspace_id", "type"])
    op.create_index("idx_notes_updated", "notes", ["workspace_id", "updated_at"])
    op.create_index("idx_notes_archived", "notes", ["workspace_id", "is_archived"])

    # note_tags table
    op.create_table(
        "note_tags",
        sa.Column(
            "note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("tag", sa.String(100), primary_key=True),
        sa.Column("source", sa.String(10), nullable=False, server_default="ai"),
    )
    op.create_index("idx_note_tags_tag", "note_tags", ["tag"])
    op.create_index("idx_note_tags_note", "note_tags", ["note_id"])

    # conversations table
    op.create_table(
        "conversations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_conversations_workspace", "conversations", ["workspace_id", "updated_at"])

    # messages table
    op.create_table(
        "messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model_used", sa.String(200), nullable=True),
        sa.Column("provider_used", sa.String(50), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("context_sources", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_messages_conversation", "messages", ["conversation_id", "created_at"])

    # onboarding table
    op.create_table(
        "onboarding",
        sa.Column("id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("is_complete", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("current_step", sa.String(50), nullable=False, server_default="welcome"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name="onboarding_singleton"),
    )


def downgrade() -> None:
    op.drop_table("onboarding")
    op.drop_index("idx_messages_conversation", "messages")
    op.drop_table("messages")
    op.drop_index("idx_conversations_workspace", "conversations")
    op.drop_table("conversations")
    op.drop_index("idx_note_tags_tag", "note_tags")
    op.drop_index("idx_note_tags_note", "note_tags")
    op.drop_table("note_tags")
    op.drop_index("idx_notes_archived", "notes")
    op.drop_index("idx_notes_updated", "notes")
    op.drop_index("idx_notes_type", "notes")
    op.drop_index("idx_notes_workspace", "notes")
    op.drop_table("notes")
    op.drop_table("workspaces")
    op.drop_index("idx_llm_providers_system_default", "llm_providers")
    op.drop_table("llm_providers")
    op.drop_table("config")
