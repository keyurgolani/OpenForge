"""Phase 7 Profile Core Models

Revision ID: 006_phase7_profile_core
Revises: 005_phase5_graph
Create Date: 2026-03-14

This migration creates the core profile building block models:
- CapabilityBundleModel: Composable bundles of agent capabilities
- ModelPolicyModel: LLM model selection and usage constraints
- MemoryPolicyModel: Context assembly and memory management
- OutputContractModel: Expected output format and behavior

Also adds version field to agent_profiles.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_phase7_profile_core'
down_revision = '005_phase5_graph_foundation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add version column to agent_profiles
    op.add_column(
        'agent_profiles',
        sa.Column('version', sa.String(20), nullable=False, server_default='1.0.0')
    )

    # Create capability_bundles table
    op.create_table(
        'capability_bundles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),

        # Tool capabilities
        sa.Column('tools_enabled', sa.Boolean, default=True),
        sa.Column('allowed_tool_categories', postgresql.JSONB, nullable=True),
        sa.Column('blocked_tool_ids', postgresql.JSONB, default=list),
        sa.Column('tool_overrides', postgresql.JSONB, default=dict),
        sa.Column('max_tool_calls_per_minute', sa.Integer, default=30),
        sa.Column('max_tool_calls_per_execution', sa.Integer, default=200),

        # Skill capabilities
        sa.Column('skill_ids', postgresql.JSONB, default=list),

        # Retrieval capabilities
        sa.Column('retrieval_enabled', sa.Boolean, default=True),
        sa.Column('retrieval_limit', sa.Integer, default=5),
        sa.Column('retrieval_score_threshold', sa.Float, default=0.35),
        sa.Column('knowledge_scope', sa.String(50), default='workspace'),

        # Metadata
        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('status', sa.String(50), default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_capability_bundles_slug', 'capability_bundles', ['slug'])

    # Create model_policies table
    op.create_table(
        'model_policies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),

        sa.Column('default_provider_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('default_model', sa.String(200), nullable=True),
        sa.Column('allow_runtime_override', sa.Boolean, default=True),
        sa.Column('allowed_models', postgresql.JSONB, default=list),
        sa.Column('blocked_models', postgresql.JSONB, default=list),
        sa.Column('max_tokens_per_request', sa.Integer, nullable=True),
        sa.Column('max_tokens_per_day', sa.Integer, nullable=True),

        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('status', sa.String(50), default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_model_policies_slug', 'model_policies', ['slug'])

    # Create memory_policies table
    op.create_table(
        'memory_policies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),

        sa.Column('history_limit', sa.Integer, default=20),
        sa.Column('history_strategy', sa.String(50), default='sliding_window'),
        sa.Column('attachment_support', sa.Boolean, default=True),
        sa.Column('auto_bookmark_urls', sa.Boolean, default=True),
        sa.Column('mention_support', sa.Boolean, default=True),

        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('status', sa.String(50), default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_memory_policies_slug', 'memory_policies', ['slug'])

    # Create output_contracts table
    op.create_table(
        'output_contracts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),

        sa.Column('execution_mode', sa.String(50), default='streaming'),
        sa.Column('require_structured_output', sa.Boolean, default=False),
        sa.Column('output_schema', postgresql.JSONB, nullable=True),
        sa.Column('require_citations', sa.Boolean, default=False),

        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('status', sa.String(50), default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_output_contracts_slug', 'output_contracts', ['slug'])


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index('idx_output_contracts_slug', 'output_contracts')
    op.drop_table('output_contracts')

    op.drop_index('idx_memory_policies_slug', 'memory_policies')
    op.drop_table('memory_policies')

    op.drop_index('idx_model_policies_slug', 'model_policies')
    op.drop_table('model_policies')

    op.drop_index('idx_capability_bundles_slug', 'capability_bundles')
    op.drop_table('capability_bundles')

    # Remove version column from agent_profiles
    op.drop_column('agent_profiles', 'version')
