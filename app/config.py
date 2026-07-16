import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"

def get_database_url() -> str:
    DATA_DIR.mkdir(exist_ok=True)
    db_path = os.environ.get("DATABASE_URL", str(DATA_DIR / "crapper.db"))
    if db_path.startswith("sqlite:///"):
        return db_path
    return f"sqlite:///{db_path}"


# PRAGMA configuration set at every connection
SQLITE_PRAGMAS = [
    "PRAGMA journal_mode=WAL",           # Concurrent reads during writes
    "PRAGMA synchronous=NORMAL",         # Safe with WAL, fast
    "PRAGMA busy_timeout=5000",          # 5s wait before SQLITE_BUSY
    "PRAGMA foreign_keys=ON",            # FK enforcement
    "PRAGMA cache_size=-64000",          # 64MB page cache
    "PRAGMA mmap_size=268435456",        # 256MB memory-mapped I/O
]

# Upload limits
MAX_UPLOAD_SIZE_MB = 10
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# App
APP_NAME = "Crapper Keeper"
DEBUG = os.environ.get("DEBUG", "true").lower() == "true"
