"""Initial schema (all tables except script_iterations).

Revision ID: 001_initial
Revises:
Create Date: 2025-02-08

Run this once on empty DB. Existing DBs: run 'alembic stamp 001_initial' then 'alembic upgrade head'.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("script_content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_id"), "projects", ["id"], unique=False)

    op.create_table(
        "script_prompts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("script_description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_script_prompts_id"), "script_prompts", ["id"], unique=False)

    op.create_table(
        "scene_styles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("parameters", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scene_styles_id"), "scene_styles", ["id"], unique=False)

    op.create_table(
        "visual_styles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("parameters", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_visual_styles_id"), "visual_styles", ["id"], unique=False)

    op.create_table(
        "image_references",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_path", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_image_references_id"), "image_references", ["id"], unique=False)

    op.create_table(
        "scenes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("visual_description", sa.Text(), nullable=True),
        sa.Column("current_visual_description_id", sa.Integer(), nullable=True),
        sa.Column("scene_style_id", sa.Integer(), nullable=True),
        sa.Column("image_reference_id", sa.Integer(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["image_reference_id"], ["image_references.id"], name=op.f("fk_scenes_image_reference_id_image_references")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name=op.f("fk_scenes_project_id_projects")),
        sa.ForeignKeyConstraint(["scene_style_id"], ["scene_styles.id"], name=op.f("fk_scenes_scene_style_id_scene_styles")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scenes_id"), "scenes", ["id"], unique=False)
    op.create_index(op.f("ix_scenes_project_id"), "scenes", ["project_id"], unique=False)

    op.create_table(
        "visual_descriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scene_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("scene_style_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], name=op.f("fk_visual_descriptions_scene_id_scenes")),
        sa.ForeignKeyConstraint(["scene_style_id"], ["scene_styles.id"], name=op.f("fk_visual_descriptions_scene_style_id_scene_styles")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_visual_descriptions_id"), "visual_descriptions", ["id"], unique=False)
    op.create_index(op.f("ix_visual_descriptions_scene_id"), "visual_descriptions", ["scene_id"], unique=False)

    op.create_foreign_key(
        op.f("fk_scenes_current_visual_description_id_visual_descriptions"),
        "scenes", "visual_descriptions",
        ["current_visual_description_id"], ["id"],
    )

    op.create_table(
        "images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scene_id", sa.Integer(), nullable=False),
        sa.Column("visual_style_id", sa.Integer(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["scene_id"], ["scenes.id"], name=op.f("fk_images_scene_id_scenes")),
        sa.ForeignKeyConstraint(["visual_style_id"], ["visual_styles.id"], name=op.f("fk_images_visual_style_id_visual_styles")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_images_id"), "images", ["id"], unique=False)
    op.create_index(op.f("ix_images_scene_id"), "images", ["scene_id"], unique=False)

    op.create_table(
        "videos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name=op.f("fk_videos_project_id_projects")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_videos_id"), "videos", ["id"], unique=False)
    op.create_index(op.f("ix_videos_project_id"), "videos", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_videos_project_id"), table_name="videos")
    op.drop_index(op.f("ix_videos_id"), table_name="videos")
    op.drop_table("videos")
    op.drop_index(op.f("ix_images_scene_id"), table_name="images")
    op.drop_index(op.f("ix_images_id"), table_name="images")
    op.drop_table("images")
    op.drop_constraint(op.f("fk_scenes_current_visual_description_id_visual_descriptions"), "scenes", type_="foreignkey")
    op.drop_index(op.f("ix_visual_descriptions_scene_id"), table_name="visual_descriptions")
    op.drop_index(op.f("ix_visual_descriptions_id"), table_name="visual_descriptions")
    op.drop_table("visual_descriptions")
    op.drop_index(op.f("ix_scenes_project_id"), table_name="scenes")
    op.drop_index(op.f("ix_scenes_id"), table_name="scenes")
    op.drop_table("scenes")
    op.drop_index(op.f("ix_image_references_id"), table_name="image_references")
    op.drop_table("image_references")
    op.drop_index(op.f("ix_visual_styles_id"), table_name="visual_styles")
    op.drop_table("visual_styles")
    op.drop_index(op.f("ix_scene_styles_id"), table_name="scene_styles")
    op.drop_table("scene_styles")
    op.drop_index(op.f("ix_script_prompts_id"), table_name="script_prompts")
    op.drop_table("script_prompts")
    op.drop_index(op.f("ix_projects_id"), table_name="projects")
    op.drop_table("projects")
