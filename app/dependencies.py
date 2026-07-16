from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.config import get_database_url, SQLITE_PRAGMAS

_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        db_url = get_database_url()
        _engine = create_engine(
            db_url,
            echo=False,
            connect_args={"check_same_thread": False} if "sqlite" in db_url else {},
        )

        @event.listens_for(_engine, "connect")
        def set_pragmas(dbapi_connection, connection_record):
            if "sqlite" in db_url:
                cursor = dbapi_connection.cursor()
                for pragma in SQLITE_PRAGMAS:
                    cursor.execute(pragma)
                cursor.close()

    return _engine


def get_session() -> Session:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal()


def get_db():
    """FastAPI dependency — yields a session, closes after request."""
    session = get_session()
    try:
        yield session
    finally:
        session.close()
