"""Delete notebooks, sections, and pages without tripping SQLite foreign keys."""

from sqlalchemy.orm import Session
from app.models import Notebook, Page, Section, SectionGroup


def delete_page_rows(db: Session, pages: list) -> None:
    """Delete pages leaves-first so parent_page_id foreign keys succeed."""
    pending = list(pages)
    for _ in range(len(pages) + 1):
        if not pending:
            return
        leaves = [
            page for page in pending
            if not any(other.parent_page_id == page.id for other in pending if other is not page)
        ]
        if not leaves:
            leaves = list(pending)
        for page in leaves:
            db.delete(page)
        db.flush()
        removed = {id(page) for page in leaves}
        pending = [page for page in pending if id(page) not in removed]


def delete_page_tree(db: Session, page: Page) -> None:
    pages = db.query(Page).filter_by(section_id=page.section_id).all()
    by_parent: dict = {}
    for item in pages:
        by_parent.setdefault(item.parent_page_id, []).append(item)
    keep = []
    stack = [page]
    seen = set()
    while stack:
        current = stack.pop()
        if current.id in seen:
            continue
        seen.add(current.id)
        keep.append(current)
        stack.extend(by_parent.get(current.id, []))
    delete_page_rows(db, keep)


def delete_section_record(db: Session, section: Section) -> None:
    delete_page_rows(db, db.query(Page).filter_by(section_id=section.id).all())
    db.delete(section)
    db.flush()


def _delete_groups(db: Session, groups: list) -> None:
    pending = list(groups)
    for _ in range(len(groups) + 1):
        if not pending:
            return
        leaves = [
            group for group in pending
            if not any(other.parent_id == group.id for other in pending if other is not group)
        ]
        if not leaves:
            leaves = list(pending)
        for group in leaves:
            db.delete(group)
        db.flush()
        removed = {id(group) for group in leaves}
        pending = [group for group in pending if id(group) not in removed]


def delete_notebook_record(db: Session, notebook: Notebook) -> None:
    sections = db.query(Section).filter_by(notebook_id=notebook.id).all()
    for section in sections:
        delete_section_record(db, section)
    _delete_groups(db, db.query(SectionGroup).filter_by(notebook_id=notebook.id).all())
    db.delete(notebook)
    db.flush()
