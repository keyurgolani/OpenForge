"""
v3 LLM Redesign — composable virtual providers with unified endpoint abstraction.

Drops old LLM provider/config tables and recreates them with:
- llm_providers (simplified, no provider_type)
- llm_models (discovered/registered models per provider)
- llm_virtual_providers (router, council, optimizer)
- llm_endpoints (unified model reference — standard or virtual)
- llm_router_config / llm_router_tiers (endpoint-based)
- llm_council_config / llm_council_members (endpoint-based)
- llm_optimizer_config (endpoint-based)
- workspaces updated to use chat_endpoint_id / vision_endpoint_id
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "014_llm_redesign"
down_revision = "013_tool_execution_log"
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Drop old config tables (children first due to FKs) ─────────────

    op.drop_table("llm_optimizer_config")
    op.drop_table("llm_council_members")
    op.drop_table("llm_council_config")
    op.drop_index("idx_router_tiers_config", table_name="llm_router_tiers")
    op.drop_table("llm_router_tiers")
    op.drop_table("llm_router_config")

    # ── 2. Drop old workspace columns ─────────────────────────────────────

    op.drop_column("workspaces", "vision_model")
    op.drop_column("workspaces", "vision_provider_id")

    # Also drop old llm_provider_id / llm_model if they exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    ws_cols = [c["name"] for c in inspector.get_columns("workspaces")]
    if "llm_provider_id" in ws_cols:
        op.drop_column("workspaces", "llm_provider_id")
    if "llm_model" in ws_cols:
        op.drop_column("workspaces", "llm_model")

    # ── 3. Rebuild llm_providers (drop old, create new) ───────────────────

    # Drop old llm_providers (CASCADE will remove orphan FKs)
    op.drop_table("llm_providers")

    op.create_table(
        "llm_providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("api_key_enc", sa.LargeBinary, nullable=True),
        sa.Column("endpoint_id", sa.String(50), nullable=False, server_default="default"),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── 4. Create llm_models ──────────────────────────────────────────────

    op.create_table(
        "llm_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model_id", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("capabilities", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("provider_id", "model_id", name="uq_llm_model_provider_model"),
    )

    # ── 5. Create llm_virtual_providers ───────────────────────────────────

    op.create_table(
        "llm_virtual_providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("virtual_type", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "virtual_type IN ('router', 'council', 'optimizer')",
            name="ck_virtual_type",
        ),
    )

    # ── 6. Create llm_endpoints ───────────────────────────────────────────

    op.create_table(
        "llm_endpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("endpoint_type", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column(
            "provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("model_id", sa.String(200), nullable=True),
        sa.Column(
            "virtual_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("is_default_chat", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_default_vision", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "endpoint_type IN ('standard', 'virtual')",
            name="ck_endpoint_type",
        ),
        sa.CheckConstraint(
            "(endpoint_type = 'standard' AND provider_id IS NOT NULL AND model_id IS NOT NULL AND virtual_provider_id IS NULL) OR "
            "(endpoint_type = 'virtual' AND virtual_provider_id IS NOT NULL AND provider_id IS NULL AND model_id IS NULL)",
            name="ck_endpoint_consistency",
        ),
    )
    op.create_index(
        "idx_llm_endpoints_default_chat",
        "llm_endpoints",
        ["is_default_chat"],
        unique=True,
        postgresql_where=sa.text("is_default_chat = TRUE"),
    )
    op.create_index(
        "idx_llm_endpoints_default_vision",
        "llm_endpoints",
        ["is_default_vision"],
        unique=True,
        postgresql_where=sa.text("is_default_vision = TRUE"),
    )

    # ── 7. Add endpoint columns to workspaces ─────────────────────────────

    op.add_column(
        "workspaces",
        sa.Column(
            "chat_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "workspaces",
        sa.Column(
            "vision_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # ── 8. Recreate config tables with endpoint references ────────────────

    op.create_table(
        "llm_router_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "virtual_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "routing_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
            nullable=False,
        ),
        sa.Column("complexity_level", sa.String(20), nullable=False),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "idx_router_tiers_config",
        "llm_router_tiers",
        ["router_config_id", "complexity_level", "priority"],
    )

    op.create_table(
        "llm_council_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "virtual_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "chairman_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
            nullable=False,
        ),
        sa.Column(
            "endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_label", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "llm_optimizer_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "virtual_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_virtual_providers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "optimizer_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_endpoints.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("optimization_prompt", sa.Text, nullable=True),
        sa.Column("additional_context", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    # Drop new config tables
    op.drop_table("llm_optimizer_config")
    op.drop_table("llm_council_members")
    op.drop_table("llm_council_config")
    op.drop_index("idx_router_tiers_config", table_name="llm_router_tiers")
    op.drop_table("llm_router_tiers")
    op.drop_table("llm_router_config")

    # Drop new workspace columns
    op.drop_column("workspaces", "vision_endpoint_id")
    op.drop_column("workspaces", "chat_endpoint_id")

    # Drop new tables
    op.drop_index("idx_llm_endpoints_default_vision", table_name="llm_endpoints")
    op.drop_index("idx_llm_endpoints_default_chat", table_name="llm_endpoints")
    op.drop_table("llm_endpoints")
    op.drop_table("llm_virtual_providers")
    op.drop_table("llm_models")
    op.drop_table("llm_providers")

    # Recreate old llm_providers
    op.create_table(
        "llm_providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("api_key_enc", sa.LargeBinary, nullable=True),
        sa.Column("default_model", sa.String(200), nullable=True),
        sa.Column("enabled_models", postgresql.JSONB, nullable=True),
        sa.Column("endpoint_id", sa.String(50), nullable=False, server_default="default"),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("is_system_default", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("provider_type", sa.String(20), nullable=False, server_default="standard"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Recreate old workspace columns
    op.add_column(
        "workspaces",
        sa.Column(
            "vision_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("workspaces", sa.Column("vision_model", sa.String(200), nullable=True))

    # Recreate old config tables
    op.create_table(
        "llm_router_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("llm_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("routing_model_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id"), nullable=False),
        sa.Column("routing_model", sa.String(200), nullable=False),
        sa.Column("routing_prompt", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "llm_router_tiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("router_config_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_router_config.id", ondelete="CASCADE"), nullable=False),
        sa.Column("complexity_level", sa.String(20), nullable=False),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column("llm_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id"), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_router_tiers_config", "llm_router_tiers", ["router_config_id", "complexity_level", "priority"])

    op.create_table(
        "llm_council_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("llm_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("chairman_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id"), nullable=False),
        sa.Column("chairman_model", sa.String(200), nullable=False),
        sa.Column("judging_prompt", sa.Text, nullable=True),
        sa.Column("parallel_execution", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "llm_council_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("council_config_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_council_config.id", ondelete="CASCADE"), nullable=False),
        sa.Column("llm_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id"), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("display_label", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "llm_optimizer_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("llm_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("optimizer_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id"), nullable=False),
        sa.Column("optimizer_model", sa.String(200), nullable=False),
        sa.Column("target_provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("llm_providers.id"), nullable=False),
        sa.Column("target_model", sa.String(200), nullable=False),
        sa.Column("optimization_prompt", sa.Text, nullable=True),
        sa.Column("additional_context", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
