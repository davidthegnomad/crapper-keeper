from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from pathlib import Path
from app.utils.file_storage import save_upload, guess_mime
from app.config import UPLOADS_DIR

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image, return URL for embedding in the editor."""
    if not file.content_type or not file.content_type.startswith("image/"):
        return JSONResponse({"error": "Only image files allowed"}, status_code=400)

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        return JSONResponse({"error": "File too large (max 10MB)"}, status_code=400)

    _, rel_path = save_upload(data, file.filename or "image.png")
    return JSONResponse({"url": f"/{rel_path}", "filename": file.filename})
