from fastapi import APIRouter, Request, Depends, Form, Path
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.dependencies import get_db
from app.models import Notebook
from app.utils import templates

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


# ── Landing page (redirect to first notebook) ─────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def landing(request: Request, db: Session = Depends(get_db)):
    """Landing: redirect to first notebook's first section's first page."""
    notebook = db.query(Notebook).order_by(Notebook.id).first()
    if not notebook:
        # No notebooks yet — show empty state with CTA
        return templates.TemplateResponse(
            request, "base.html",
            {"request": request, "notebooks": [], "current_notebook": None,
             "sections": [], "current_section": None,
             "pages": [], "current_page": None}
        )
    return RedirectResponse(url=f"/notebooks/{notebook.id}", status_code=302)


# ── View notebook ─────────────────────────────────────────────────────────────

@router.get("/{notebook_id}", response_class=HTMLResponse)
async def view_notebook(request: Request, notebook_id: int, db: Session = Depends(get_db)):
    """Show a notebook — full page with sections and first section's pages."""
    notebook = db.query(Notebook).filter_by(id=notebook_id).first()
    if not notebook:
        return HTMLResponse("Notebook not found", status_code=404)

    from app.models import Section, Page, SectionGroup
    notebooks = db.query(Notebook).order_by(Notebook.position).all()
    groups = db.query(SectionGroup).filter_by(notebook_id=notebook_id).order_by(SectionGroup.position).all()
    sections = db.query(Section).filter_by(notebook_id=notebook_id, section_group_id=None).order_by(Section.position).all()

    first_section = sections[0] if sections else None
    pages = []
    if first_section:
        pages = db.query(Page).filter_by(section_id=first_section.id, parent_page_id=None).order_by(Page.position).all()

    # Subpages for each page
    pages_with_subs = []
    for p in pages:
        subs = db.query(Page).filter_by(parent_page_id=p.id).order_by(Page.position).all()
        pages_with_subs.append((p, subs))

    return templates.TemplateResponse(request, "base.html", {
        "request": request,
        "notebooks": notebooks,
        "current_notebook": notebook,
        "section_groups": groups,
        "sections": sections,
        "current_section": first_section,
        "pages": pages_with_subs,
        "current_page": pages[0] if pages else None,
    })


# ── CRUD partials ─────────────────────────────────────────────────────────────

@router.post("/", response_class=HTMLResponse)
async def create_notebook(request: Request, title: str = Form(...), db: Session = Depends(get_db)):
    """Create a new notebook — re-render the notebook list in sidebar."""
    max_pos = db.query(Notebook).order_by(Notebook.position.desc()).first()
    pos = (max_pos.position + 1) if max_pos else 0
    nb = Notebook(title=title, position=pos)
    db.add(nb)
    db.commit()
    db.refresh(nb)

    # Return the full page for the new notebook
    return RedirectResponse(url=f"/notebooks/{nb.id}", status_code=302)


@router.put("/{notebook_id}", response_class=HTMLResponse)
async def rename_notebook(request: Request, notebook_id: int, title: str = Form(...), db: Session = Depends(get_db)):
    nb = db.query(Notebook).filter_by(id=notebook_id).first()
    if nb:
        nb.title = title
        db.commit()
    notebooks = db.query(Notebook).order_by(Notebook.position).all()
    return templates.TemplateResponse(request, "components/notebook_list.html", {
        "request": request, "notebooks": notebooks, "current_notebook": nb
    })


@router.delete("/{notebook_id}", response_class=HTMLResponse)
async def delete_notebook(request: Request, notebook_id: int, db: Session = Depends(get_db)):
    nb = db.query(Notebook).filter_by(id=notebook_id).first()
    if nb:
        db.delete(nb)
        db.commit()

    remaining = db.query(Notebook).order_by(Notebook.id).first()
    if remaining:
        return RedirectResponse(url=f"/notebooks/{remaining.id}", status_code=302)
    return RedirectResponse(url="/notebooks/", status_code=302)
