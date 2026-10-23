"""FastAPI → HTMX response helpers."""

from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse
from markupsafe import escape
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


def is_htmx(request: Request) -> bool:
    return request.headers.get("hx-request", "").lower() == "true"


def nav_or_redirect(request: Request, url: str):
    """Full navigation. HTMX gets HX-Redirect so a 302 document is not swapped into the body."""
    if is_htmx(request):
        return redirect_hx(request, url)
    return RedirectResponse(url=url, status_code=302)


def inline_error(message: str) -> HTMLResponse:
    return HTMLResponse(f'<span class="form-error">{escape(message)}</span>', status_code=200)
