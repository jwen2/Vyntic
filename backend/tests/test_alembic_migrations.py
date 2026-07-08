"""
Alembic migration chain (Plan 4, Task A1).

The migration history is the single source of schema truth from here on.
Pins:
- Upgrading an empty database to head produces a schema identical to the
  ORM models (the durable guard — fails if a model changes without a
  migration).
- init_db()/run_migrations on a fresh DB creates the schema and stamps
  alembic_version at head.
- A pre-Alembic database (tables from create_all, no alembic_version) is
  adopted in place: stamped at head without touching existing data.
"""
import os

import pytest
from sqlalchemy import create_engine, inspect, text

from app.database import Base, run_migrations


@pytest.fixture
def scratch_url(tmp_path):
    return f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}"


def _tables(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_upgrade_head_matches_models(scratch_url):
    run_migrations(scratch_url)

    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    engine = create_engine(scratch_url)
    try:
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            diff = compare_metadata(ctx, Base.metadata)
    finally:
        engine.dispose()
    assert diff == [], f"migration chain diverges from models: {diff}"


def test_fresh_db_created_and_stamped(scratch_url):
    run_migrations(scratch_url)
    tables = _tables(scratch_url)
    assert "alembic_version" in tables
    assert "deals" in tables
    assert "audit_log" in tables


def test_pre_alembic_db_adopted_in_place(scratch_url):
    # Simulate the pilot DB: full current schema from create_all, real data,
    # no alembic_version.
    engine = create_engine(scratch_url)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO deals (deal_id, name) VALUES ('d1', 'Pilot Deal')")
        )
    engine.dispose()

    run_migrations(scratch_url)

    engine = create_engine(scratch_url)
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            name = conn.execute(text("SELECT name FROM deals WHERE deal_id='d1'")).scalar()
    finally:
        engine.dispose()
    assert version is not None
    assert name == "Pilot Deal"


def test_run_migrations_idempotent(scratch_url):
    run_migrations(scratch_url)
    run_migrations(scratch_url)  # second run is a no-op, must not raise
    assert "deals" in _tables(scratch_url)
