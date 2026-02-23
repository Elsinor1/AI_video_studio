"""Add caption position columns to voiceovers.

Revision ID: 005_caption_position
Revises: 004_voices
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005_caption_position"
down_revision: Union[str, None] = "004_voices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("voiceovers", sa.Column("caption_alignment", sa.Integer(), server_default="2", nullable=False))
    op.add_column("voiceovers", sa.Column("caption_margin_v", sa.Integer(), server_default="60", nullable=False))


def downgrade() -> None:
    op.drop_column("voiceovers", "caption_margin_v")
    op.drop_column("voiceovers", "caption_alignment")
