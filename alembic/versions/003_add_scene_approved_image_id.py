"""Add approved_image_id to scenes.

Revision ID: 003_approved
Revises: 002_iter
Create Date: 2025-02-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_approved"
down_revision: Union[str, None] = "002_iter"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scenes", sa.Column("approved_image_id", sa.Integer(), nullable=True))
    # FK omitted for SQLite compatibility; app enforces referential integrity


def downgrade() -> None:
    op.drop_column("scenes", "approved_image_id")
