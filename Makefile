.PHONY: dev migrate seed test backup clean

dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
	alembic upgrade head

migration:
	alembic revision --autogenerate -m "$(msg)"

seed:
	python seed.py

test:
	python -m pytest tests/ -v

backup:
	@mkdir -p backups
	python -c "import sqlite3; db=sqlite3.connect('data/crapper.db'); db.execute('PRAGMA wal_checkpoint(FULL)'); db.execute(\"VACUUM INTO 'backups/crapper-keeper-$$(date +%Y%m%d-%H%M%S).db'\"); db.close()"
	@echo "Backed up to backups/"

clean:
	rm -rf data/crapper.db data/crapper.db-wal data/crapper.db-shm
	rm -rf alembic/versions/*
	rm -rf uploads/images/* uploads/attachments/* uploads/audio/*

install:
	pip install -r requirements.txt
	npm install
