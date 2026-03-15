"""Phase 1 Domain Tables

Revision ID: 002_phase1_domains
Revises: 001
Create Date: 2024-03-14

This migration creates the new domain tables for the Phase 1 architecture reset.
These tables represent the final product vocabulary and will be used for all future development.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_phase1_domains'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create agent_profiles table
    op.create_table(
        'agent_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('role', sa.String(50), default='assistant'),
        sa.Column('system_prompt_ref', sa.String(500), nullable=True),
        sa.Column('model_policy_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('memory_policy_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('safety_policy_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('capability_bundle_ids', postgresql.JSONB, default=list),
        sa.Column('output_contract_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('is_template', sa.Boolean, default=False),
        sa.Column('status', sa.String(50), default='draft'),
        sa.Column('icon', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_agent_profiles_slug', 'agent_profiles', ['slug'])

    # Create workflow_definitions table
    op.create_table(
        'workflow_definitions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('version', sa.Integer, default=1),
        sa.Column('entry_node', sa.String(100), nullable=True),
        sa.Column('state_schema', postgresql.JSONB, default=dict),
        sa.Column('nodes', postgresql.JSONB, default=list),
        sa.Column('edges', postgresql.JSONB, default=list),
        sa.Column('default_input_schema', postgresql.JSONB, default=dict),
        sa.Column('default_output_schema', postgresql.JSONB, default=dict),
        sa.Column('status', sa.String(50), default='draft'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_workflow_definitions_slug', 'workflow_definitions', ['slug'])

    # Create mission_definitions table
    op.create_table(
        'mission_definitions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('default_profile_ids', postgresql.JSONB, default=list),
        sa.Column('default_trigger_ids', postgresql.JSONB, default=list),
        sa.Column('autonomy_mode', sa.String(50), default='supervised'),
        sa.Column('approval_policy_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('budget_policy_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('output_artifact_types', postgresql.JSONB, default=list),
        sa.Column('status', sa.String(50), default='draft'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_mission_definitions_slug', 'mission_definitions', ['slug'])
    op.create_index('idx_mission_definitions_workflow_id', 'mission_definitions', ['workflow_id'])

    # Create trigger_definitions table
    op.create_table(
        'trigger_definitions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('trigger_type', sa.String(50), nullable=False),
        sa.Column('target_type', sa.String(50), nullable=False),
        sa.Column('target_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('schedule_expression', sa.String(100), nullable=True),
        sa.Column('payload_template', postgresql.JSONB, nullable=True),
        sa.Column('is_enabled', sa.Boolean, default=True),
        sa.Column('status', sa.String(50), default='draft'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_trigger_definitions_target_id', 'trigger_definitions', ['target_id'])

    # Create runs table
    op.create_table(
        'runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('run_type', sa.String(50), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('mission_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('parent_run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(50), default='pending'),
        sa.Column('state_snapshot', postgresql.JSONB, default=dict),
        sa.Column('input_payload', postgresql.JSONB, default=dict),
        sa.Column('output_payload', postgresql.JSONB, default=dict),
        sa.Column('error_code', sa.String(100), nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_runs_workflow_id', 'runs', ['workflow_id'])
    op.create_index('idx_runs_mission_id', 'runs', ['mission_id'])
    op.create_index('idx_runs_parent_run_id', 'runs', ['parent_run_id'])
    op.create_index('idx_runs_workspace_id', 'runs', ['workspace_id'])

    # Create artifacts table
    op.create_table(
        'artifacts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('artifact_type', sa.String(50), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('source_mission_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('summary', sa.Text, nullable=True),
        sa.Column('content', postgresql.JSONB, default=dict),
        sa.Column('metadata', postgresql.JSONB, default=dict),
        sa.Column('status', sa.String(50), default='draft'),
        sa.Column('version', sa.Integer, default=1),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('idx_artifacts_workspace_id', 'artifacts', ['workspace_id'])
    op.create_index('idx_artifacts_source_run_id', 'artifacts', ['source_run_id'])
    op.create_index('idx_artifacts_source_mission_id', 'artifacts', ['source_mission_id'])


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index('idx_artifacts_source_mission_id', 'artifacts')
    op.drop_index('idx_artifacts_source_run_id', 'artifacts')
    op.drop_index('idx_artifacts_workspace_id', 'artifacts')
    op.drop_table('artifacts')

    op.drop_index('idx_runs_workspace_id', 'runs')
    op.drop_index('idx_runs_parent_run_id', 'runs')
    op.drop_index('idx_runs_mission_id', 'runs')
    op.drop_index('idx_runs_workflow_id', 'runs')
    op.drop_table('runs')

    op.drop_index('idx_trigger_definitions_target_id', 'trigger_definitions')
    op.drop_table('trigger_definitions')

    op.drop_index('idx_mission_definitions_workflow_id', 'mission_definitions')
    op.drop_index('idx_mission_definitions_slug', 'mission_definitions')
    op.drop_table('mission_definitions')

    op.drop_index('idx_workflow_definitions_slug', 'workflow_definitions')
    op.drop_table('workflow_definitions')

    op.drop_index('idx_agent_profiles_slug', 'agent_profiles')
    op.drop_table('agent_profiles')
