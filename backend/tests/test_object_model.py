"""Tests for the Manager → Fund → Position object model.

Covers manager CRUD + RBAC, fund creation and stage validation, document
classification, position upsert, the manager-shared context path, and —
critically — that context never crosses manager boundaries.
"""
import asyncio

import pytest

from app.auth import grant_deal_access
from app.database import SessionLocal, DocumentRow, engine
from app.database import _ensure_schema_migrations
from app.models.deal import DealCreate, FUND_STAGES
from app.models.document import DocumentMetadata
from app.models.manager import ManagerCreate
from app.services import deal_store, manager_store
from app.services.context_provider import load_deal_context, load_doc_context, get_doc_page_chunks


def _make_manager(manager_id="hillpath", name="Hillpath Capital"):
    return manager_store.create_manager(ManagerCreate(manager_id=manager_id, name=name))


def _make_fund(deal_id, manager_id, name=None, stage="Diligence"):
    return deal_store.create_deal(DealCreate(
        deal_id=deal_id,
        name=name or deal_id,
        entity_type="fund",
        manager_id=manager_id,
        stage=stage,
        vintage=2024,
        strategy="Buyout",
    ))


def _add_doc(deal_id, doc_id, filename, scope="entity", doc_category="other", text="## Page 1\nHello"):
    deal_store.add_document(deal_id, DocumentMetadata(
        doc_id=doc_id,
        deal_id=deal_id,
        filename=filename,
        page_count=1,
        full_text_md=text,
        doc_category=doc_category,
        scope=scope,
    ))


# ── Manager CRUD + RBAC ──

class TestManagerRoutes:
    def test_create_get_list_update_delete(self, client):
        r = client.post("/managers", json={"manager_id": "hillpath", "name": "Hillpath Capital"})
        assert r.status_code == 200
        assert r.json()["fund_count"] == 0

        r = client.post("/managers", json={"manager_id": "hillpath", "name": "Dup"})
        assert r.status_code == 409

        r = client.get("/managers")
        assert [m["manager_id"] for m in r.json()] == ["hillpath"]

        r = client.patch("/managers/hillpath", json={"description": "Mid-market buyout GP"})
        assert r.json()["description"] == "Mid-market buyout GP"

        r = client.delete("/managers/hillpath")
        assert r.status_code == 200
        assert client.get("/managers/hillpath").status_code == 404

    def test_mutations_require_admin(self, analyst_client):
        assert analyst_client.post(
            "/managers", json={"manager_id": "m1", "name": "M1"}
        ).status_code == 403
        assert analyst_client.patch("/managers/m1", json={"name": "X"}).status_code == 403
        assert analyst_client.delete("/managers/m1").status_code == 403

    def test_delete_manager_detaches_funds(self, client, admin_user):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        client.delete("/managers/hillpath")
        deal = deal_store.get_deal("fund_iv")
        assert deal is not None  # fund survives
        assert deal.manager_id is None

    def test_manager_documents_rbac(self, client, analyst_client, analyst_user):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        _add_doc("fund_iv", "doc_ddq", "ddq.pdf", scope="manager", doc_category="ddq")

        # No fund access → 403
        assert analyst_client.get("/managers/hillpath/documents").status_code == 403

        # Access to one fund of the manager → allowed
        grant_deal_access(analyst_user.id, "fund_iv", role="analyst")
        r = analyst_client.get("/managers/hillpath/documents")
        assert r.status_code == 200
        assert [d["doc_id"] for d in r.json()] == ["doc_ddq"]

    def test_manager_funds_are_filtered_by_access(self, analyst_client, analyst_user):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        _make_fund("fund_v", "hillpath")
        grant_deal_access(analyst_user.id, "fund_iv", role="analyst")

        response = analyst_client.get("/managers/hillpath/funds")
        assert response.status_code == 200
        assert [fund["deal_id"] for fund in response.json()] == ["fund_iv"]


# ── Fund creation + stage validation ──

class TestFundLifecycle:
    def test_create_fund_with_manager(self, client):
        _make_manager()
        r = client.post("/deals", json={
            "deal_id": "fund_iv",
            "name": "Hillpath Fund IV",
            "entity_type": "fund",
            "manager_id": "hillpath",
            "stage": "Diligence",
            "vintage": 2024,
            "strategy": "Buyout",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["entity_type"] == "fund"
        assert body["manager_name"] == "Hillpath Capital"
        assert body["vintage"] == 2024

    def test_fund_stage_validation(self, client):
        _make_manager()
        r = client.post("/deals", json={
            "deal_id": "fund_iv",
            "name": "Fund IV",
            "entity_type": "fund",
            "manager_id": "hillpath",
            "stage": "IC Review",  # deal stage, not a fund stage
        })
        assert r.status_code == 422

    def test_deal_stage_unchanged(self, client):
        r = client.post("/deals", json={
            "deal_id": "proj_atlas",
            "name": "Project Atlas",
            "stage": "IC Review",
        })
        assert r.status_code == 200
        # Fund stages rejected for plain deals
        r = client.patch("/deals/proj_atlas", json={"stage": "Monitoring"})
        assert r.status_code == 422

    def test_manager_requires_fund_entity(self, client):
        _make_manager()
        r = client.post("/deals", json={
            "deal_id": "proj_atlas",
            "name": "Project Atlas",
            "manager_id": "hillpath",
        })
        assert r.status_code == 422

    def test_unknown_manager_rejected(self, client):
        r = client.post("/deals", json={
            "deal_id": "fund_iv",
            "name": "Fund IV",
            "entity_type": "fund",
            "manager_id": "ghost",
            "stage": "Screening",
        })
        assert r.status_code == 422

    def test_stage_metadata_endpoint(self, client):
        assert client.get("/deals/metadata/stages").json()[0] == "Screening"
        assert client.get("/deals/metadata/stages?entity_type=fund").json() == FUND_STAGES

    def test_fund_stage_update(self, client):
        _make_manager()
        _make_fund("fund_iv", "hillpath", stage="IC")
        r = client.patch("/deals/fund_iv", json={"stage": "Committed"})
        assert r.status_code == 200
        assert r.json()["stage"] == "Committed"


# ── Positions ──

class TestPositions:
    def test_position_upsert_and_get(self, client):
        _make_manager()
        _make_fund("fund_iv", "hillpath")

        # Empty position before any upsert — not a 404
        r = client.get("/deals/fund_iv/position")
        assert r.status_code == 200
        assert r.json()["commitment_amount"] is None

        r = client.put("/deals/fund_iv/position", json={
            "commitment_amount": 25_000_000,
            "currency": "USD",
            "as_of": "2026-Q2",
        })
        assert r.status_code == 200

        # Partial update preserves earlier fields
        client.put("/deals/fund_iv/position", json={"called_amount": 10_000_000})
        body = client.get("/deals/fund_iv/position").json()
        assert body["commitment_amount"] == 25_000_000
        assert body["called_amount"] == 10_000_000
        assert body["as_of"] == "2026-Q2"

    def test_position_rejected_for_plain_deal(self, client, sample_deal):
        r = client.put("/deals/test_deal/position", json={"commitment_amount": 1})
        assert r.status_code == 422

    def test_position_upsert_requires_admin(self, analyst_client, grant_analyst_access):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        grant_analyst_access("fund_iv")
        r = analyst_client.put("/deals/fund_iv/position", json={"commitment_amount": 1})
        assert r.status_code == 403


# ── Document classification ──

class TestDocumentClassification:
    def test_classification_persists(self, client):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        _add_doc("fund_iv", "doc_lpa", "lpa.pdf", doc_category="lpa")
        docs = client.get("/deals/fund_iv/documents").json()
        assert docs[0]["doc_category"] == "lpa"
        assert docs[0]["scope"] == "entity"

    def test_metadata_patch(self, client):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        _add_doc("fund_iv", "doc_1", "mystery.pdf")
        r = client.patch("/deals/fund_iv/documents/doc_1/metadata", json={
            "doc_category": "quarterly_report",
            "period": "2026-Q1",
        })
        assert r.status_code == 200
        assert r.json()["doc_category"] == "quarterly_report"
        assert r.json()["period"] == "2026-Q1"

    def test_metadata_patch_validates_category(self, client):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        _add_doc("fund_iv", "doc_1", "mystery.pdf")
        r = client.patch("/deals/fund_iv/documents/doc_1/metadata", json={
            "doc_category": "not_a_category",
        })
        assert r.status_code == 422

    def test_metadata_patch_requires_admin(self, analyst_client, grant_analyst_access):
        _make_manager()
        _make_fund("fund_iv", "hillpath")
        grant_analyst_access("fund_iv")
        _add_doc("fund_iv", "doc_1", "mystery.pdf")
        r = analyst_client.patch("/deals/fund_iv/documents/doc_1/metadata", json={
            "doc_category": "lpa",
        })
        assert r.status_code == 403


# ── Manager-shared context (the isolation-critical part) ──

class TestManagerSharedContext:
    def _setup_two_managers(self):
        _make_manager("hillpath", "Hillpath Capital")
        _make_manager("rivergate", "Rivergate Partners")
        _make_fund("hp_fund_iv", "hillpath")
        _make_fund("hp_fund_v", "hillpath")
        _make_fund("rg_fund_ii", "rivergate")
        # Manager-scoped DDQ uploaded to Hillpath Fund IV
        _add_doc("hp_fund_iv", "doc_ddq", "hillpath_ddq.pdf", scope="manager",
                 doc_category="ddq", text="## Page 1\nHillpath DDQ answers")
        # Entity-scoped doc in Fund IV (must NOT leak to Fund V)
        _add_doc("hp_fund_iv", "doc_lpa", "fund_iv_lpa.pdf", scope="entity",
                 doc_category="lpa", text="## Page 1\nFund IV LPA terms")
        # Rivergate doc (must NOT leak to any Hillpath fund)
        _add_doc("rg_fund_ii", "doc_rg", "rivergate_ddq.pdf", scope="manager",
                 doc_category="ddq", text="## Page 1\nRivergate DDQ answers")

    def test_sibling_fund_sees_manager_scoped_doc(self, clear_store):
        self._setup_two_managers()
        chunks = asyncio.run(load_deal_context("hp_fund_v", "q"))
        files = {c["source_file"] for c in chunks}
        assert "hillpath_ddq.pdf" in files

    def test_entity_scoped_doc_does_not_leak_to_sibling(self, clear_store):
        self._setup_two_managers()
        chunks = asyncio.run(load_deal_context("hp_fund_v", "q"))
        files = {c["source_file"] for c in chunks}
        assert "fund_iv_lpa.pdf" not in files

    def test_no_cross_manager_bleed(self, clear_store):
        self._setup_two_managers()
        hp_chunks = asyncio.run(load_deal_context("hp_fund_v", "q"))
        assert all("rivergate" not in c["source_file"] for c in hp_chunks)
        rg_chunks = asyncio.run(load_deal_context("rg_fund_ii", "q"))
        assert all("hillpath" not in c["source_file"] for c in rg_chunks)

    def test_own_deal_sees_own_docs_only_when_no_manager(self, clear_store, sample_deal):
        _add_doc("test_deal", "doc_x", "cim.pdf", text="## Page 1\nCIM content")
        self._setup_two_managers()
        chunks = asyncio.run(load_deal_context("test_deal", "q"))
        assert {c["source_file"] for c in chunks} == {"cim.pdf"}

    def test_doc_context_resolves_shared_doc(self, clear_store):
        self._setup_two_managers()
        # Fund V asks a doc-scoped question against the shared DDQ (owned by Fund IV)
        chunks = asyncio.run(load_doc_context("hp_fund_v", "doc_ddq", "q"))
        assert chunks and chunks[0]["source_file"] == "hillpath_ddq.pdf"
        # Citation enrichment path resolves too
        assert get_doc_page_chunks("hp_fund_v", "doc_ddq")

    def test_doc_context_does_not_resolve_cross_manager(self, clear_store):
        self._setup_two_managers()
        assert asyncio.run(load_doc_context("hp_fund_v", "doc_rg", "q")) == []
        assert get_doc_page_chunks("hp_fund_v", "doc_rg") == []

    def test_doc_context_does_not_resolve_entity_scoped_sibling(self, clear_store):
        self._setup_two_managers()
        assert asyncio.run(load_doc_context("hp_fund_v", "doc_lpa", "q")) == []


# ── Migration shim ──

class TestMigrations:
    def test_schema_migrations_idempotent(self, clear_store):
        # Running the shim on an up-to-date schema is a no-op both times.
        _ensure_schema_migrations()
        _ensure_schema_migrations()
        # Sanity: the new columns are queryable.
        db = SessionLocal()
        try:
            db.query(DocumentRow.doc_category, DocumentRow.period, DocumentRow.scope).all()
        finally:
            db.close()
