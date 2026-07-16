"""Initial migration — all models + FTS5 virtual table + triggers.

Revision ID: 001_initial
Create Date: 2026-07-16
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Notebooks
    op.create_table("notebooks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("color", sa.String(7), default="#5B9BD5"),
        sa.Column("position", sa.Integer(), default=0, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Section Groups
    op.create_table("section_groups",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("notebook_id", sa.Integer(), sa.ForeignKey("notebooks.id"), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("section_groups.id"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer(), default=0, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Sections
    op.create_table("sections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("notebook_id", sa.Integer(), sa.ForeignKey("notebooks.id"), nullable=False),
        sa.Column("section_group_id", sa.Integer(), sa.ForeignKey("section_groups.id"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("color", sa.String(7), default="#5B9BD5"),
        sa.Column("is_collapsed", sa.Boolean(), default=False),
        sa.Column("position", sa.Integer(), default=0, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Pages
    op.create_table("pages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("section_id", sa.Integer(), sa.ForeignKey("sections.id"), nullable=False),
        sa.Column("parent_page_id", sa.Integer(), sa.ForeignKey("pages.id"), nullable=True),
        sa.Column("title", sa.String(255), default="Untitled Page", nullable=False),
        sa.Column("content_json", sa.Text(), default="{}", nullable=False),
        sa.Column("content_html", sa.Text(), default="", nullable=False),
        sa.Column("content_plain", sa.Text(), default="", nullable=False),
        sa.Column("page_mode", sa.String(16), default="linear"),
        sa.Column("tree_path", sa.String(512), nullable=True),
        sa.Column("position", sa.Integer(), default=0, nullable=False),
        sa.Column("is_collapsed", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Containers
    op.create_table("containers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("page_id", sa.Integer(), sa.ForeignKey("pages.id"), nullable=False),
        sa.Column("content_json", sa.Text(), default="{}", nullable=False),
        sa.Column("content_html", sa.Text(), default="", nullable=False),
        sa.Column("x", sa.Float(), default=0.0),
        sa.Column("y", sa.Float(), default=0.0),
        sa.Column("width", sa.Float(), nullable=True),
        sa.Column("height", sa.Float(), nullable=True),
        sa.Column("z_index", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Tag Definitions
    op.create_table("tag_definitions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("notebook_id", sa.Integer(), sa.ForeignKey("notebooks.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("tag_type", sa.String(32), nullable=False),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("has_state", sa.Boolean(), default=False),
        sa.Column("state_schema", sa.Text(), nullable=True),
        sa.Column("is_custom", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Tag Instances
    op.create_table("tag_instances",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tag_definition_id", sa.Integer(), sa.ForeignKey("tag_definitions.id"), nullable=False),
        sa.Column("page_id", sa.Integer(), sa.ForeignKey("pages.id"), nullable=False),
        sa.Column("container_id", sa.String(36), nullable=True),
        sa.Column("paragraph_id", sa.String(100), nullable=True),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # File Uploads
    op.create_table("file_uploads",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("page_id", sa.Integer(), sa.ForeignKey("pages.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(512), nullable=False, unique=True),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("thumbnail_path", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Redirects
    op.create_table("redirects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("old_page_id", sa.Integer(), unique=True, nullable=False),
        sa.Column("new_page_id", sa.Integer(), sa.ForeignKey("pages.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # FTS5 Virtual Table
    op.execute("""
        CREATE VIRTUAL TABLE pages_fts USING fts5(
            title, content_plain,
            content='pages', content_rowid='id'
        )
    """)

    # FTS Sync Triggers
    op.execute("""
        CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
            INSERT INTO pages_fts(rowid, title, content_plain)
            VALUES (new.id, new.title, new.content_plain);
        END
    """)
    op.execute("""
        CREATE TRIGGER pages_ad AFTER DELETE ON pages BEGIN
            INSERT INTO pages_fts(pages_fts, rowid, title, content_plain)
            VALUES ('delete', old.id, old.title, old.content_plain);
        END
    """)
    op.execute("""
        CREATE TRIGGER pages_au AFTER UPDATE ON pages BEGIN
            INSERT INTO pages_fts(pages_fts, rowid, title, content_plain)
            VALUES ('delete', old.id, old.title, old.content_plain);
            INSERT INTO pages_fts(rowid, title, content_plain)
            VALUES (new.id, new.title, new.content_plain);
        END
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS pages_au")
    op.execute("DROP TRIGGER IF EXISTS pages_ad")
    op.execute("DROP TRIGGER IF EXISTS pages_ai")
    op.execute("DROP TABLE IF EXISTS pages_fts")
    op.drop_table("redirects")
    op.drop_table("file_uploads")
    op.drop_table("tag_instances")
    op.drop_table("tag_definitions")
    op.drop_table("containers")
    op.drop_table("pages")
    op.drop_table("sections")
    op.drop_table("section_groups")
    op.drop_table("notebooks")
