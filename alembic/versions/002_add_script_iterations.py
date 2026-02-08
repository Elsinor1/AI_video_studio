"""Add script_iterations table.

Revision ID: 002_iter
Revises: 001_initial
Create Date: 2025-02-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_iter"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "script_iterations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("user_feedback", sa.Text(), nullable=False),
        sa.Column("revised_script", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name=op.f("fk_script_iterations_project_id_projects")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_script_iterations_id"), "script_iterations", ["id"], unique=False)
    op.create_index(op.f("ix_script_iterations_project_id"), "script_iterations", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_script_iterations_project_id"), table_name="script_iterations")
    op.drop_index(op.f("ix_script_iterations_id"), table_name="script_iterations")
    op.drop_table("script_iterations")
