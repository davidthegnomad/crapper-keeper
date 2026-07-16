"""Content-addressed file storage."""

import hashlib
import mimetypes
from pathlib import Path
from app.config import UPLOADS_DIR


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def storage_path(file_hash: str, original_filename: str) -> Path:
    """Generate content-addressed path: uploads/images/ab/cd/abcdef123456.ext"""
    ext = Path(original_filename).suffix
    base = UPLOADS_DIR / "images"
    subdir = base / file_hash[:2] / file_hash[2:4]
    return subdir / f"{file_hash}{ext}"


def save_upload(data: bytes, original_filename: str) -> tuple[str, str]:
    """
    Save file to content-addressed storage.
    Returns (file_hash, relative_storage_path).
    """
    h = content_hash(data)
    path = storage_path(h, original_filename)
    path.parent.mkdir(parents=True, exist_ok=True)

    if not path.exists():
        path.write_bytes(data)

    rel = str(path.relative_to(UPLOADS_DIR.parent))
    return h, rel


def guess_mime(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"
