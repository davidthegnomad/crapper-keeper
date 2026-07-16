from fastapi import APIRouter, Request, Depends, Form, Path
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.dependencies import get_db
from app.models import Section, Page, SectionGroup, Notebook
from app.utils import templates

router = APIRouter(prefix="/notebooks/{notebook_id}/sections", tags=["sections"])


@router.get("/{section_id}", response_class=HTMLResponse)
async def view_section(request: Request, notebook_id: int, section_id: int, db: Session = Depends(get_db)):
    """Show a section — full page with all notebook context."""
    notebook = db.query(Notebook).filter_by(id=notebook_id).first()
    section = db.query(Section).filter_by(id=section_id).first()
    if not notebook or not section:
        return HTMLResponse("Not found", status_code=404)

    notebooks = db.query(Notebook).order_by(Notebook.position).all()
    groups = db.query(SectionGroup).filter_by(notebook_id=notebook_id).order_by(SectionGroup.position).all()
    sections = db.query(Section).filter_by(notebook_id=notebook_id, section_group_id=None).order_by(Section.position).all()

    pages = db.query(Page).filter_by(section_id=section_id, parent_page_id=None).order_by(Page.position).all()
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
        "current_section": section,
        "pages": pages_with_subs,
        "current_page": pages[0] if pages else None,
    })


@router.post("/", response_class=HTMLResponse)
async def create_section(request: Request, notebook_id: int, title: str = Form(...),
                         group_id: int = Form(None), color: str = Form("#5B9BD5"),
                         db: Session = Depends(get_db)):
    max_pos = db.query(Section).filter_by(notebook_id=notebook_id).order_by(Section.position.desc()).first()
    pos = (max_pos.position + 1) if max_pos else 0
    s = Section(notebook_id=notebook_id, section_group_id=group_id, title=title,
                color=color, position=pos)
    db.add(s)
    db.commit()
    db.refresh(s)

    # Auto-create a default page
    p = Page(section_id=s.id, title="Untitled Page", position=0,
             tree_path=f"{0:04d}")
    db.add(p)
    db.commit()

    return RedirectResponse(url=f"/notebooks/{notebook_id}/sections/{s.id}", status_code=302)


@router.put("/{section_id}", response_class=HTMLResponse)
async def rename_section(request: Request, notebook_id: int, section_id: int,
                         title: str = Form(...), color: str = Form(None), db: Session = Depends(get_db)):
    s = db.query(Section).filter_by(id=section_id).first()
    if s:
        if title:
            s.title = title
        if color:
            s.color = color
        db.commit()
    return RedirectResponse(url=f"/notebooks/{notebook_id}/sections/{section_id}", status_code=302)


@router.delete("/{section_id}", response_class=HTMLResponse)
async def delete_section(request: Request, notebook_id: int, section_id: int, db: Session = Depends(get_db)):
    s = db.query(Section).filter_by(id=section_id).first()
    if s:
        db.delete(s)
        db.commit()

    remaining = db.query(Section).filter_by(notebook_id=notebook_id).order_by(Section.id).first()
    if remaining:
        return RedirectResponse(url=f"/notebooks/{notebook_id}/sections/{remaining.id}", status_code=302)
    return RedirectResponse(url=f"/notebooks/{notebook_id}", status_code=302)


@router.post("/{section_id}/move", response_class=HTMLResponse)
async def move_section(request: Request, notebook_id: int, section_id: int,
                       position: int = Form(...), db: Session = Depends(get_db)):
    s = db.query(Section).filter_by(id=section_id).first()
    if s:
        s.position = position
        db.commit()
    return HTMLResponse("OK")
