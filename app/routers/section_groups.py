from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.dependencies import get_db
from app.models import SectionGroup
from app.utils import templates

router = APIRouter(prefix="/notebooks/{notebook_id}/groups", tags=["section_groups"])


@router.post("/", response_class=HTMLResponse)
async def create_group(request: Request, notebook_id: int, title: str = Form(...), db: Session = Depends(get_db)):
    max_pos = db.query(SectionGroup).filter_by(notebook_id=notebook_id).order_by(SectionGroup.position.desc()).first()
    pos = (max_pos.position + 1) if max_pos else 0
    sg = SectionGroup(notebook_id=notebook_id, title=title, position=pos)
    db.add(sg)
    db.commit()
    return RedirectResponse(url=f"/notebooks/{notebook_id}", status_code=302)


@router.put("/{group_id}", response_class=HTMLResponse)
async def rename_group(request: Request, notebook_id: int, group_id: int, title: str = Form(...), db: Session = Depends(get_db)):
    sg = db.query(SectionGroup).filter_by(id=group_id).first()
    if sg:
        sg.title = title
        db.commit()
    return RedirectResponse(url=f"/notebooks/{notebook_id}", status_code=302)


@router.delete("/{group_id}", response_class=HTMLResponse)
async def delete_group(request: Request, notebook_id: int, group_id: int, db: Session = Depends(get_db)):
    sg = db.query(SectionGroup).filter_by(id=group_id).first()
    if sg:
        db.delete(sg)
        db.commit()
    return RedirectResponse(url=f"/notebooks/{notebook_id}", status_code=302)
