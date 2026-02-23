"""Add voices table and voiceover TTS settings columns.

Revision ID: 004_voices
Revises: 003_approved
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004_voices"
down_revision: Union[str, None] = "003_approved"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("elevenlabs_voice_id", sa.String(), nullable=False),
        sa.Column("model_id", sa.String(), server_default="eleven_multilingual_v2"),
        sa.Column("stability", sa.Float(), server_default="0.5"),
        sa.Column("similarity_boost", sa.Float(), server_default="0.75"),
        sa.Column("style", sa.Float(), server_default="0.0"),
        sa.Column("speed", sa.Float(), server_default="1.0"),
        sa.Column("use_speaker_boost", sa.Boolean(), server_default="1"),
        sa.Column("language_code", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_voices_id", "voices", ["id"], unique=False)

    op.add_column("voiceovers", sa.Column("voice_id", sa.Integer(), nullable=True))
    op.add_column("voiceovers", sa.Column("tts_settings", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("voiceovers", "tts_settings")
    op.drop_column("voiceovers", "voice_id")
    op.drop_index("ix_voices_id", table_name="voices")
    op.drop_table("voices")
