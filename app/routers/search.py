from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.dependencies import get_db
from app.utils import templates

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def search(request: Request, q: str = Query(""), db: Session = Depends(get_db)):
    """Full-text search across all pages."""
    if not q.strip():
        return templates.TemplateResponse(request, "components/search_results.html", {
            "request": request, "query": "", "results": []
        })

    # Use FTS5 to search, joining back to pages for context
    rows = db.execute(text("""
        SELECT p.id, p.title, p.section_id, s.title AS section_title,
               n.title AS notebook_title, n.id AS notebook_id,
               snippet(pages_fts, 1, '<mark>', '</mark>', '...', 40) AS snippet
        FROM pages_fts
        JOIN pages p ON pages_fts.rowid = p.id
        JOIN sections s ON p.section_id = s.id
        JOIN notebooks n ON s.notebook_id = n.id
        WHERE pages_fts MATCH :query
        ORDER BY rank
        LIMIT 30
    """), {"query": q}).fetchall()

    results = [dict(r._mapping) for r in rows]
    return templates.TemplateResponse(request, "components/search_results.html", {
        "request": request, "query": q, "results": results
    })
