"""Pytest fixtures. Always a temp sqlite file — never data/crapper.db."""

import os
import tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = str(Path(tempfile.mkdtemp(prefix="ck-pytest-")) / "test.db")

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_engine
from app.main import app
from app.models import Base

_FTS = [
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        title, content_plain,
        content='pages', content_rowid='id'
    )
    """,
    """
    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
        INSERT INTO pages_fts(rowid, title, content_plain)
        VALUES (new.id, new.title, new.content_plain);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
        INSERT INTO pages_fts(pages_fts, rowid, title, content_plain)
        VALUES ('delete', old.id, old.title, old.content_plain);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
        INSERT INTO pages_fts(pages_fts, rowid, title, content_plain)
        VALUES ('delete', old.id, old.title, old.content_plain);
        INSERT INTO pages_fts(rowid, title, content_plain)
        VALUES (new.id, new.title, new.content_plain);
    END
    """,
]


@pytest.fixture(scope="session")
def client():
    engine = get_engine()
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for stmt in _FTS:
            conn.exec_driver_sql(stmt)
    with TestClient(app) as test_client:
        yield test_client
