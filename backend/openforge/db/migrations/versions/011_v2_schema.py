"""
v2 Schema Migration

Adds:
- provider_type column to llm_providers
- vision_provider_id and vision_model columns to workspaces
- file-related columns to knowledge (file_path, file_size, mime_type, thumbnail_path, file_metadata)
- tool_calls and execution_id columns to messages
- LLM Router tables (llm_router_config, llm_router_tiers)
- LLM Council tables (llm_council_config, llm_council_members)
- MCP Server tables (mcp_servers, mcp_tool_overrides)
- Tool Definition table (tool_definitions)
- HITL tables (hitl_requests, hitl_audit_log)
- Agent Execution table (agent_executions)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "011_v2_schema"
down_revision = "010_msg_attach_nullable_mid"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add provider_type column to llm_providers
    op.add_column(
        "llm_providers",
        sa.Column("provider_type", sa.String(20), nullable=False, server_default="standard")
    )

    # 2. Add vision model columns to workspaces
    op.add_column(
        "workspaces",
        sa.Column(
            "vision_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="SET NULL"),
            nullable=True
        )
    )
    op.add_column(
        "workspaces",
        sa.Column("vision_model", sa.String(200), nullable=True)
    )

    # 3. Add tool tracking columns to messages (tool_calls only, execution_id added after agent_executions table)
    op.add_column(
        "messages",
        sa.Column("tool_calls", postgresql.JSONB, nullable=True)
    )

    # 3b. Add file-related columns to knowledge table
    op.add_column(
        "knowledge",
        sa.Column("file_path", sa.String(500), nullable=True)
    )
    op.add_column(
        "knowledge",
        sa.Column("file_size", sa.Integer, nullable=True)
    )
    op.add_column(
        "knowledge",
        sa.Column("mime_type", sa.String(100), nullable=True)
    )
    op.add_column(
        "knowledge",
        sa.Column("thumbnail_path", sa.String(500), nullable=True)
    )
    op.add_column(
        "knowledge",
        sa.Column("file_metadata", postgresql.JSONB, nullable=True)
    )

    # 4. Create LLM Router tables
    op.create_table(
        "llm_router_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "llm_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True
        ),
        sa.Column(
            "routing_model_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id"),
            nullable=False
        ),
        sa.Column("routing_model", sa.String(200), nullable=False),
        sa.Column("routing_prompt", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "llm_router_tiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "router_config_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_router_config.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column("complexity_level", sa.String(20), nullable=False),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "llm_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id"),
            nullable=False
        ),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "idx_router_tiers_config",
        "llm_router_tiers",
        ["router_config_id", "complexity_level", "priority"]
    )

    # 5. Create LLM Council tables
    op.create_table(
        "llm_council_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "llm_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True
        ),
        sa.Column(
            "chairman_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id"),
            nullable=False
        ),
        sa.Column("chairman_model", sa.String(200), nullable=False),
        sa.Column("judging_prompt", sa.Text, nullable=True),
        sa.Column("parallel_execution", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "llm_council_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "council_config_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_council_config.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column(
            "llm_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id"),
            nullable=False
        ),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("display_label", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 6. Create MCP Server tables
    op.create_table(
        "mcp_servers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("auth_type", sa.String(20), nullable=False, server_default="none"),
        sa.Column("auth_value_enc", sa.LargeBinary, nullable=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("discovered_tools", postgresql.JSONB, nullable=True),
        sa.Column("last_discovered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("default_risk_level", sa.String(20), nullable=False, server_default="high"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "mcp_tool_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "mcp_server_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column("tool_name", sa.String(200), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_override"),
    )

    # 7. Create Tool Definitions table
    op.create_table(
        "tool_definitions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("input_schema", postgresql.JSONB, nullable=False),
        sa.Column("output_schema", postgresql.JSONB, nullable=True),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="low"),
        sa.Column("requires_workspace_scope", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 8. Create Agent Executions table (must be before messages.execution_id foreign key)
    op.create_table(
        "agent_executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="SET NULL"),
            nullable=True
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("iteration_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tool_calls", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("checkpoint_state", postgresql.JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_agent_exec_workspace",
        "agent_executions",
        ["workspace_id", "started_at"]
    )
    op.create_index(
        "idx_agent_exec_status",
        "agent_executions",
        ["status"],
        postgresql_where="status IN ('running', 'paused_hitl')"
    )

    # 8b. Add execution_id column to messages (now that agent_executions table exists)
    op.add_column(
        "messages",
        sa.Column(
            "execution_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agent_executions.id", ondelete="SET NULL"),
            nullable=True
        )
    )

    # 9. Create HITL tables
    op.create_table(
        "hitl_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True
        ),
        sa.Column("execution_id", sa.String(200), nullable=False),
        sa.Column("agent_state", postgresql.JSONB, nullable=False),
        sa.Column("tool_id", sa.String(100), nullable=False),
        sa.Column("tool_input", postgresql.JSONB, nullable=False),
        sa.Column("action_summary", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "idx_hitl_pending",
        "hitl_requests",
        ["status", "created_at"],
        postgresql_where="status = 'pending'"
    )
    op.create_index(
        "idx_hitl_workspace",
        "hitl_requests",
        ["workspace_id", "created_at"]
    )
    op.create_index(
        "idx_hitl_conversation",
        "hitl_requests",
        ["conversation_id"],
        postgresql_where="conversation_id IS NOT NULL"
    )

    op.create_table(
        "hitl_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "hitl_request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hitl_requests.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    # Drop tables in reverse order
    op.drop_table("hitl_audit_log")
    op.drop_table("hitl_requests")

    # Drop execution_id column before dropping agent_executions table (FK constraint)
    op.drop_column("messages", "execution_id")

    op.drop_table("agent_executions")
    op.drop_table("tool_definitions")
    op.drop_table("mcp_tool_overrides")
    op.drop_table("mcp_servers")
    op.drop_table("llm_council_members")
    op.drop_table("llm_council_config")
    op.drop_index("idx_router_tiers_config", "llm_router_tiers")
    op.drop_table("llm_router_tiers")
    op.drop_table("llm_router_config")

    # Drop columns
    op.drop_column("messages", "tool_calls")
    op.drop_column("knowledge", "file_metadata")
    op.drop_column("knowledge", "thumbnail_path")
    op.drop_column("knowledge", "mime_type")
    op.drop_column("knowledge", "file_size")
    op.drop_column("knowledge", "file_path")
    op.drop_column("workspaces", "vision_model")
    op.drop_column("workspaces", "vision_provider_id")
    op.drop_column("llm_providers", "provider_type")
