from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.dependencies import get_session
from app.models import Notebook
from app.utils import templates

router = APIRouter(tags=["root"])


@router.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Root redirects to first notebook."""
    db = get_session()
    try:
        notebook = db.query(Notebook).order_by(Notebook.id).first()
        if notebook:
            return RedirectResponse(url=f"/notebooks/{notebook.id}", status_code=302)
        return templates.TemplateResponse(request, "base.html", {
            "request": request, "notebooks": [], "current_notebook": None,
            "section_groups": [], "sections": [], "current_section": None,
            "pages": [], "current_page": None,
        })
    finally:
        db.close()
