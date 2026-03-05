"""add generation_ms to messages

Revision ID: 005_message_generation_ms
Revises: 004
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "005_message_generation_ms"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("generation_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "generation_ms")
