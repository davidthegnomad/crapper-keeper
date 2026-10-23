from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse
from markupsafe import escape
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from app.dependencies import get_db
from app.utils import templates

router = APIRouter(prefix="/search", tags=["search"])

_MARK_START = "\x01"
_MARK_END = "\x02"


def fts_phrase(q: str) -> str:
    """Quote the user string as one FTS phrase so punctuation is not query syntax."""
    return '"' + q.replace('"', '""') + '"'


def highlight_snippet(raw: str) -> str:
    """Escape snippet text, then restore the marker pair as <mark>."""
    if not raw:
        return ""
    parts = raw.split(_MARK_START)
    out = [str(escape(parts[0]))]
    for part in parts[1:]:
        marked, _, rest = part.partition(_MARK_END)
        out.append("<mark>" + str(escape(marked)) + "</mark>")
        out.append(str(escape(rest)))
    return "".join(out)


def _like_results(db: Session, q: str):
    like = f"%{q.replace(chr(0), '')}%"
    return db.execute(text("""
        SELECT p.id, p.title, p.section_id, s.title AS section_title,
               n.title AS notebook_title, n.id AS notebook_id,
               substr(p.content_plain, 1, 180) AS snippet
        FROM pages p
        JOIN sections s ON p.section_id = s.id
        JOIN notebooks n ON s.notebook_id = n.id
        WHERE p.title LIKE :like OR p.content_plain LIKE :like
        LIMIT 30
    """), {"like": like}).fetchall()


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def search(request: Request, q: str = Query(""), db: Session = Depends(get_db)):
    """Full-text search across all pages."""
    if not q.strip():
        return templates.TemplateResponse(request, "components/search_results.html", {
            "request": request, "query": "", "results": []
        })

    highlighted = True
    try:
        rows = db.execute(text("""
            SELECT p.id, p.title, p.section_id, s.title AS section_title,
                   n.title AS notebook_title, n.id AS notebook_id,
                   snippet(pages_fts, 1, :mark_start, :mark_end, '...', 40) AS snippet
            FROM pages_fts
            JOIN pages p ON pages_fts.rowid = p.id
            JOIN sections s ON p.section_id = s.id
            JOIN notebooks n ON s.notebook_id = n.id
            WHERE pages_fts MATCH :query
            ORDER BY rank
            LIMIT 30
        """), {"query": fts_phrase(q), "mark_start": _MARK_START, "mark_end": _MARK_END}).fetchall()
    except OperationalError:
        db.rollback()
        highlighted = False
        rows = _like_results(db, q.strip())

    results = []
    for row in rows:
        item = dict(row._mapping)
        raw = item.get("snippet") or ""
        item["snippet"] = highlight_snippet(raw) if highlighted else str(escape(raw))
        results.append(item)
    return templates.TemplateResponse(request, "components/search_results.html", {
        "request": request, "query": q, "results": results
    })
