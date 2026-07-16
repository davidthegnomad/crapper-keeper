from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, HTMLResponse
from pathlib import Path
from app.dependencies import get_engine, get_session
from app.models import Notebook
from app.routers import notebooks, sections, section_groups, pages, search, upload
from app.config import APP_NAME, UPLOADS_DIR, DEBUG
from app.utils import templates

def create_app() -> FastAPI:
    app = FastAPI(title=APP_NAME, debug=DEBUG)

    # Static files
    app.mount("/static", StaticFiles(directory="app/static"), name="static")
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

    # Routers
    app.include_router(notebooks.router)
    app.include_router(section_groups.router)
    app.include_router(sections.router)
    app.include_router(pages.router)
    app.include_router(search.router)
    app.include_router(upload.router)

    # Startup
    @app.on_event("startup")
    def startup():
        get_engine()  # triggers PRAGMA config on first connection

    # Root route
    @app.get("/")
    async def root_redirect(request: Request):
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

    return app


app = create_app()
