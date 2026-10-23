from fastapi import APIRouter, Request, Depends, Form, Path, Body
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from app.dependencies import get_db
from app.models import Page, Section, Notebook, SectionGroup
from app.utils import templates
from app.utils.deletes import delete_page_tree
from app.utils.htmx import nav_or_redirect
from app.utils.prose_mirror import generate_derived
import json

router = APIRouter(prefix="/pages", tags=["pages"])


@router.get("/{page_id}", response_class=HTMLResponse)
async def view_page(request: Request, page_id: int, db: Session = Depends(get_db)):
    page = db.query(Page).filter_by(id=page_id).first()
    if not page:
        return HTMLResponse("Page not found", status_code=404)

    section = page.section
    notebook = section.notebook
    notebooks = db.query(Notebook).order_by(Notebook.position).all()
    groups = db.query(SectionGroup).filter_by(notebook_id=notebook.id).order_by(SectionGroup.position).all()
    sections = db.query(Section).filter_by(notebook_id=notebook.id, section_group_id=None).order_by(Section.position).all()

    pages = db.query(Page).filter_by(section_id=section.id, parent_page_id=None).order_by(Page.position).all()
    pages_with_subs = []
    for p in pages:
        subs = db.query(Page).filter_by(parent_page_id=p.id).order_by(Page.position).all()
        pages_with_subs.append((p, subs))

    return templates.TemplateResponse(request, "base.html", {
        "request": request,
        "notebooks": notebooks, "current_notebook": notebook,
        "section_groups": groups, "sections": sections, "current_section": section,
        "pages": pages_with_subs, "current_page": page,
    })


@router.post("/", response_class=HTMLResponse)
async def create_page(request: Request, section_id: int = Form(...), title: str = Form(""),
                      parent_page_id: Optional[int] = Form(None), db: Session = Depends(get_db)):
    section = db.query(Section).filter_by(id=section_id).first()
    if not section:
        return HTMLResponse("Section not found", status_code=404)
    title = (title or "").strip() or "Untitled Page"

    if parent_page_id:
        max_pos = db.query(Page).filter_by(parent_page_id=parent_page_id).order_by(Page.position.desc()).first()
    else:
        max_pos = db.query(Page).filter_by(section_id=section_id, parent_page_id=None).order_by(Page.position.desc()).first()
    pos = (max_pos.position + 1) if max_pos else 0

    page = Page(section_id=section_id, parent_page_id=parent_page_id, title=title,
                position=pos, tree_path=f"{pos:04d}")
    db.add(page)
    db.commit()
    db.refresh(page)
    return nav_or_redirect(request, f"/pages/{page.id}")


@router.post("/reorder")
async def reorder_pages(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    ids = body.get("ids") or []
    for index, raw in enumerate(ids):
        try:
            page_id = int(raw)
        except (TypeError, ValueError):
            continue
        page = db.query(Page).filter_by(id=page_id).first()
        if page:
            page.position = index
    db.commit()
    return JSONResponse({"status": "ok"})


@router.api_route("/{page_id}", methods=["PUT", "POST"])
async def update_page_json(request: Request, page_id: int, db: Session = Depends(get_db)):
    """
    Accepts JSON body: {title: "...", content_json: "..."}
    Also accepts form data for backward compat.
    """
    page = db.query(Page).filter_by(id=page_id).first()
    if not page:
        return JSONResponse({"error": "Page not found"}, status_code=404)

    # Try JSON body first, then form data
    body = None
    title = None
    content_json_str = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        title = body.get("title")
        content_json_str = body.get("content_json")
    else:
        form = await request.form()
        title = form.get("title")
        content_json_str = form.get("content_json")

    if title is not None:
        page.title = title

    if content_json_str is not None:
        try:
            parsed = json.loads(content_json_str) if isinstance(content_json_str, str) else content_json_str
            html, plain = generate_derived(parsed)
            page.content_json = content_json_str if isinstance(content_json_str, str) else json.dumps(content_json_str)
            page.content_html = html
            page.content_plain = plain
        except (json.JSONDecodeError, KeyError):
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    db.commit()
    return JSONResponse({"status": "saved", "id": page_id})


@router.delete("/{page_id}", response_class=HTMLResponse)
async def delete_page(request: Request, page_id: int, db: Session = Depends(get_db)):
    page = db.query(Page).filter_by(id=page_id).first()
    if not page:
        return HTMLResponse("Not found", status_code=404)

    section = page.section
    section_id = section.id
    notebook_id = section.notebook_id
    delete_page_tree(db, page)
    db.commit()

    remaining = db.query(Page).filter_by(section_id=section_id, parent_page_id=None).order_by(Page.id).first()
    if remaining:
        return nav_or_redirect(request, f"/pages/{remaining.id}")
    return nav_or_redirect(request, f"/notebooks/{notebook_id}/sections/{section_id}")


# ── Move (reorder) ───────────────────────────────────────────────────────────

@router.post("/{page_id}/move", response_class=HTMLResponse)
async def move_page(request: Request, page_id: int, position: int = Form(...),
                    parent_page_id: Optional[int] = Form(None), section_id: Optional[int] = Form(None),
                    db: Session = Depends(get_db)):
    page = db.query(Page).filter_by(id=page_id).first()
    if not page:
        return HTMLResponse("Not found", status_code=404)

    if section_id is not None:
        page.section_id = section_id

    page.position = position
    if parent_page_id is not None:
        page.parent_page_id = parent_page_id if parent_page_id > 0 else None
    page.tree_path = f"{position:04d}"

    db.commit()
    return HTMLResponse("OK")
