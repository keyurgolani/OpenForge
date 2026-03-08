"""
Add is_default_tts and is_default_stt columns to llm_endpoints for audio model configuration.
"""
from alembic import op
import sqlalchemy as sa

revision = "015_audio_embedding_endpoints"
down_revision = "014_llm_redesign"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "llm_endpoints",
        sa.Column("is_default_tts", sa.Boolean, nullable=False, server_default="false"),
    )
    op.add_column(
        "llm_endpoints",
        sa.Column("is_default_stt", sa.Boolean, nullable=False, server_default="false"),
    )
    op.create_index(
        "idx_llm_endpoints_default_tts",
        "llm_endpoints",
        ["is_default_tts"],
        unique=True,
        postgresql_where=sa.text("is_default_tts = TRUE"),
    )
    op.create_index(
        "idx_llm_endpoints_default_stt",
        "llm_endpoints",
        ["is_default_stt"],
        unique=True,
        postgresql_where=sa.text("is_default_stt = TRUE"),
    )


def downgrade():
    op.drop_index("idx_llm_endpoints_default_stt", table_name="llm_endpoints")
    op.drop_index("idx_llm_endpoints_default_tts", table_name="llm_endpoints")
    op.drop_column("llm_endpoints", "is_default_stt")
    op.drop_column("llm_endpoints", "is_default_tts")
