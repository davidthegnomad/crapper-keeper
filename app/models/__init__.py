import datetime
from sqlalchemy import Column, Integer, Float, Boolean, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func

Base = declarative_base()


# ── Mixins ────────────────────────────────────────────────────────────────────
class TimestampMixin:
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class PositionedMixin:
    position = Column(Integer, default=0, nullable=False)


# ── Notebook ──────────────────────────────────────────────────────────────────

class Notebook(Base, TimestampMixin, PositionedMixin):
    __tablename__ = "notebooks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    color = Column(String(7), default="#5B9BD5")  # OneNote default blue

    # Relationships
    section_groups = relationship("SectionGroup", back_populates="notebook", cascade="all, delete-orphan")
    sections = relationship("Section", back_populates="notebook", cascade="all, delete-orphan",
                             foreign_keys="Section.notebook_id")
    tag_definitions = relationship("TagDefinition", back_populates="notebook", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Notebook id={self.id} title='{self.title}'>"


# ── Section Group ─────────────────────────────────────────────────────────────

class SectionGroup(Base, TimestampMixin, PositionedMixin):
    __tablename__ = "section_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("section_groups.id"), nullable=True)
    title = Column(String(255), nullable=False)

    # Relationships
    notebook = relationship("Notebook", back_populates="section_groups")
    sections = relationship("Section", back_populates="section_group")
    children = relationship("SectionGroup", backref="parent", remote_side=[id])

    def __repr__(self):
        return f"<SectionGroup id={self.id} title='{self.title}'>"


# ── Section ────────────────────────────────────────────────────────────────────

class Section(Base, TimestampMixin, PositionedMixin):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=False)
    section_group_id = Column(Integer, ForeignKey("section_groups.id"), nullable=True)
    title = Column(String(255), nullable=False)
    color = Column(String(7), default="#5B9BD5")
    is_collapsed = Column(Boolean, default=False)

    # Relationships
    notebook = relationship("Notebook", back_populates="sections", foreign_keys=[notebook_id])
    section_group = relationship("SectionGroup", back_populates="sections")
    pages = relationship("Page", back_populates="section",
                         cascade="all, delete-orphan",
                         primaryjoin="and_(Section.id==Page.section_id, Page.parent_page_id==None)",
                         viewonly=True)

    def __repr__(self):
        return f"<Section id={self.id} title='{self.title}' color='{self.color}'>"


# ── Page ──────────────────────────────────────────────────────────────────────

class Page(Base, TimestampMixin):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False)
    parent_page_id = Column(Integer, ForeignKey("pages.id"), nullable=True)
    title = Column(String(255), nullable=False, default="Untitled Page")
    content_json = Column(Text, nullable=False, default="{}")       # AUTHORITATIVE
    content_html = Column(Text, nullable=False, default="")         # derived from JSON
    content_plain = Column(Text, nullable=False, default="")        # plain text for FTS5
    page_mode = Column(String(16), default="linear")                # 'linear' | 'freeform'
    tree_path = Column(String(512), nullable=True)                  # e.g. "0001/0002/0003"
    position = Column(Integer, default=0, nullable=False)           # scoped to parent context
    is_collapsed = Column(Boolean, default=False)

    # Relationships
    section = relationship("Section", back_populates="pages")
    parent = relationship("Page", remote_side=[id], backref="subpages",
                          foreign_keys=[parent_page_id])
    tag_instances = relationship("TagInstance", back_populates="page", cascade="all, delete-orphan")
    containers = relationship("Container", back_populates="page", cascade="all, delete-orphan")
    file_uploads = relationship("FileUpload", back_populates="page", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Page id={self.id} title='{self.title}'>"


# ── Container (Free-Form, Tier 2) ──────────────────────────────────────────────

class Container(Base, TimestampMixin):
    __tablename__ = "containers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    content_json = Column(Text, nullable=False, default="{}")
    content_html = Column(Text, nullable=False, default="")
    x = Column(Float, default=0.0)
    y = Column(Float, default=0.0)
    width = Column(Float, nullable=True)    # NULL = auto-expand
    height = Column(Float, nullable=True)   # NULL = auto-expand
    z_index = Column(Integer, default=0)

    # Relationships
    page = relationship("Page", back_populates="containers")


# ── Tags ──────────────────────────────────────────────────────────────────────

class TagDefinition(Base, TimestampMixin):
    __tablename__ = "tag_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=False)
    name = Column(String(100), nullable=False)
    tag_type = Column(String(32), nullable=False)       # 'todo', 'flag', 'priority', 'custom'
    icon = Column(String(100), nullable=True)            # lucide icon name
    color = Column(String(7), nullable=True)
    has_state = Column(Boolean, default=False)
    state_schema = Column(Text, nullable=True)           # JSON schema for state
    is_custom = Column(Boolean, default=False)

    # Relationships
    notebook = relationship("Notebook", back_populates="tag_definitions")
    instances = relationship("TagInstance", back_populates="definition", cascade="all, delete-orphan")


class TagInstance(Base, TimestampMixin):
    __tablename__ = "tag_instances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tag_definition_id = Column(Integer, ForeignKey("tag_definitions.id"), nullable=False)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    container_id = Column(String(36), nullable=True)      # UUID of container (free-form mode)
    paragraph_id = Column(String(100), nullable=True)      # ProseMirror node position
    state = Column(Text, nullable=True)                     # JSON: {"checked": true} or {"priority": 1}

    # Relationships
    definition = relationship("TagDefinition", back_populates="instances")
    page = relationship("Page", back_populates="tag_instances")


# ── File Uploads ──────────────────────────────────────────────────────────────

class FileUpload(Base, TimestampMixin):
    __tablename__ = "file_uploads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False, unique=True)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    thumbnail_path = Column(String(512), nullable=True)

    # Relationships
    page = relationship("Page", back_populates="file_uploads")


# ── Redirects (for moved pages) ───────────────────────────────────────────────

class Redirect(Base, TimestampMixin):
    __tablename__ = "redirects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    old_page_id = Column(Integer, unique=True, nullable=False)
    new_page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
