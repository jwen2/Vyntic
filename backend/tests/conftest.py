"""
Shared test fixtures for Vyntic backend tests.
Uses a scratch SQLite database, reset between tests.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token, create_user, grant_deal_access
from app.database import Base, engine, SessionLocal
from app.services import deal_store
from app.models.deal import DealCreate


@pytest.fixture(autouse=True)
def clear_store():
    """Reset the database between tests by dropping and recreating all tables.
    Also resets the in-process rate limiter so auth tests that log in
    repeatedly don't bleed 429s into each other."""
    from app.rate_limit import limiter

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    limiter.reset()
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _client_for(user) -> TestClient:
    token = create_access_token({"sub": str(user.id)})
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


@pytest.fixture
def admin_user(clear_store):
    return create_user(
        email="admin@test.com", password="pw", full_name="Admin", is_admin=True
    )


@pytest.fixture
def analyst_user(clear_store):
    return create_user(
        email="analyst@test.com", password="pw", full_name="Analyst", is_admin=False
    )


@pytest.fixture
def client(admin_user):
    """FastAPI test client authenticated as an admin."""
    return _client_for(admin_user)


@pytest.fixture
def analyst_client(analyst_user):
    """FastAPI test client authenticated as a non-admin analyst."""
    return _client_for(analyst_user)


@pytest.fixture
def grant_analyst_access(analyst_user):
    """Grant the analyst fixture access to a deal id."""

    def _grant(deal_id: str):
        grant_deal_access(analyst_user.id, deal_id, role="analyst")

    return _grant


@pytest.fixture
def sample_deal():
    """Create and return a sample deal."""
    data = DealCreate(
        deal_id="test_deal",
        name="Test Deal Corp",
        description="A test deal",
        stage="Screening",
        tags=["Technology"],
    )
    return deal_store.create_deal(data)


@pytest.fixture
def seeded_small_deal(client):
    """A deal with two small documents, well under any budget."""
    from app.models.document import DocumentMetadata
    deal_store.create_deal(DealCreate(deal_id="alloc_small", name="Alloc Small",
                                      description="", stage="Screening", tags=[]))
    for i in (1, 2):
        deal_store.add_document("alloc_small", DocumentMetadata(
            doc_id=f"alloc_doc_{i}", deal_id="alloc_small", filename=f"doc{i}.pdf",
            page_count=1, chunk_count=1, full_text_md=f"## Page 1\n\nSmall body {i}.",
        ))
    return "alloc_small"


@pytest.fixture
def seeded_brightwater(client):
    """The two Brightwater funds, seeded from the exported eval texts.

    Drives off app.seed.SAMPLE_DEALS so categories and scopes stay in sync
    with the real seed, but inserts document rows directly with full_text_md
    read from evals/data/*.md — ingesting the PDFs would be far too slow for
    the suite, and those markdown files are the exact exported texts.
    """
    from pathlib import Path

    from app.models.document import DocumentMetadata
    from app.models.manager import ManagerCreate
    from app.seed import SAMPLE_DEALS
    from app.services import manager_store

    data_dir = Path(__file__).resolve().parent.parent / "evals" / "data"
    seeded: list[str] = []
    for entry in SAMPLE_DEALS:
        if not entry["deal_id"].startswith("brightwater_"):
            continue
        mgr = entry["manager"]
        if not manager_store.get_manager(mgr["manager_id"]):
            manager_store.create_manager(ManagerCreate(
                manager_id=mgr["manager_id"], name=mgr["name"]))
        deal_store.create_deal(DealCreate(
            deal_id=entry["deal_id"],
            name=entry["name"],
            entity_type="fund",
            manager_id=mgr["manager_id"],
            stage=entry["stage"],
            vintage=entry["vintage"],
            strategy=entry["strategy"],
        ))
        for filename in entry["files"]:
            md = data_dir / (Path(filename).stem + ".md")
            if not md.exists():
                continue  # the .xlsx track record has no exported text
            meta = entry["document_metadata"].get(filename, {})
            deal_store.add_document(entry["deal_id"], DocumentMetadata(
                doc_id=Path(filename).stem,
                deal_id=entry["deal_id"],
                filename=filename,
                page_count=1,
                full_text_md=md.read_text(encoding="utf-8"),
                doc_category=meta.get("doc_category", "other"),
                scope=meta.get("scope", "entity"),
            ))
        seeded.append(entry["deal_id"])
    assert seeded, "SAMPLE_DEALS no longer carries the Brightwater funds"
    return seeded


@pytest.fixture
def three_deals():
    """Create three sample deals for matrix tests."""
    deals = []
    for i, (name, stage, tag) in enumerate([
        ("Alpha Corp", "Screening", "Technology"),
        ("Beta Health", "Due Diligence", "Healthcare"),
        ("Gamma Mfg", "IC Review", "Industrials"),
    ]):
        d = deal_store.create_deal(DealCreate(
            deal_id=f"deal_{i}",
            name=name,
            description=f"Test deal {i}",
            stage=stage,
            tags=[tag],
        ))
        deals.append(d)
    return deals
