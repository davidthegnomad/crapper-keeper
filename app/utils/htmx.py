"""FastAPI → HTMX response helpers."""

from fastapi import Request
from fastapi.responses import HTMLResponse
from app.utils import templates


def render(request: Request, template: str, **context) -> HTMLResponse:
    """Render a Jinja2 template as an HTML fragment (for HTMX swaps)."""
    return templates.TemplateResponse(
        request,
        template,
        {**context, "request": request},
    )


def redirect_hx(request: Request, url: str) -> HTMLResponse:
    """Trigger an HTMX client-side redirect."""
    return HTMLResponse(
        content="",
        headers={"HX-Redirect": url},
    )
