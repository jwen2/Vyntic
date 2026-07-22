"""Tests for the LP monitoring wedge — capital-call queue + side-letter tracker.

Covers: notice persistence + position recompute, side-letter obligation +
check lifecycle (propose → confirm/override), field parsing, RBAC (analyst
reads, cannot mutate), and portfolio access filtering."""
import pytest

from app.auth import grant_deal_access
from app.models.deal import DealCreate
from app.models.manager import ManagerCreate, PositionUpsert
from app.models.monitoring import (
    CallNoticeCreate,
    ObligationDraft,
)
from app.models.document import DocumentMetadata
from app.services import call_notice_store, deal_store, manager_store, side_letter_store
from app.services.monitoring_extractor import _parse_fields, _num


def _fund(deal_id="fund_iv", manager_id="hillpath"):
    manager_store.create_manager(ManagerCreate(manager_id=manager_id, name="Hillpath Capital"))
    return deal_store.create_deal(DealCreate(
        deal_id=deal_id, name="Hillpath Fund IV", entity_type="fund",
        manager_id=manager_id, stage="Monitoring", vintage=2024, strategy="Buyout",
    ))


def _add_doc(deal_id, doc_id, filename="side_letter.pdf", category="side_letter"):
    deal_store.add_document(deal_id, DocumentMetadata(
        doc_id=doc_id, deal_id=deal_id, filename=filename, page_count=1,
        full_text_md="## Page 1\n...", doc_category=category,
    ))


# ── Field parsing (no LLM) ──

class TestParsing:
    def test_parse_fields(self):
        text = "Kind: call\nAmount: $2,500,000\nDue date: 2026-08-14\nPurpose: fund an add-on"
        f = _parse_fields(text)
        assert f["kind"] == "call"
        assert f["amount"] == "$2,500,000"
        assert f["due date"] == "2026-08-14"

    def test_num_cleans_currency(self):
        assert _num("$2,500,000") == 2_500_000
        assert _num("Not found") is None
        assert _num("12.5%") == 12.5


# ── Capital-call queue + position recompute ──

class TestCallNotices:
    def test_create_and_recompute_position(self, client):
        _fund()
        manager_store.upsert_position("fund_iv", PositionUpsert(commitment_amount=25_000_000))

        r = client.post("/deals/fund_iv/call-notices", json={
            "kind": "call", "amount": 5_000_000, "due_date": "2026-08-14", "purpose": "add-on",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "confirmed"

        # Position called recomputed from the confirmed notice
        pos = manager_store.get_position("fund_iv")
        assert pos.called_amount == 5_000_000

        # A second call adds; a distribution lands separately
        client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 3_000_000})
        client.post("/deals/fund_iv/call-notices", json={"kind": "distribution", "amount": 1_000_000})
        pos = manager_store.get_position("fund_iv")
        assert pos.called_amount == 8_000_000
        assert pos.distributed_amount == 1_000_000

    def test_dismissing_notice_removes_from_total(self, client):
        _fund()
        manager_store.upsert_position("fund_iv", PositionUpsert(commitment_amount=25_000_000))
        r = client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 5_000_000})
        notice_id = r.json()["id"]
        assert manager_store.get_position("fund_iv").called_amount == 5_000_000
        client.patch(f"/deals/fund_iv/call-notices/{notice_id}", json={"status": "dismissed"})
        # Recompute drops the dismissed notice
        assert manager_store.get_position("fund_iv").called_amount is None

    def test_opening_balance_plus_queue(self, client):
        _fund()
        # Mid-life commitment: opening balances from the PCAP, then a new call.
        manager_store.upsert_position("fund_iv", PositionUpsert(
            commitment_amount=25_000_000, opening_called=18_750_000, opening_distributed=6_200_000,
        ))
        pos = manager_store.get_position("fund_iv")
        assert pos.called_amount == 18_750_000  # opening + 0 notices
        assert pos.has_notices is False

        r = client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 1_875_000})
        notice_id = r.json()["id"]
        pos = manager_store.get_position("fund_iv")
        assert pos.called_amount == 20_625_000  # opening + notice
        assert pos.has_notices is True

        client.post("/deals/fund_iv/call-notices", json={"kind": "distribution", "amount": 1_400_000})
        assert manager_store.get_position("fund_iv").distributed_amount == 7_600_000

        # Dismissing reverts to the opening balance (recompute, not increment)
        client.patch(f"/deals/fund_iv/call-notices/{notice_id}", json={"status": "dismissed"})
        assert manager_store.get_position("fund_iv").called_amount == 18_750_000

    def test_legacy_direct_called_without_opening_preserved(self, client):
        _fund()
        manager_store.upsert_position("fund_iv", PositionUpsert(
            commitment_amount=25_000_000, called_amount=10_000_000,
        ))
        # No opening, no notices → direct value survives a subsequent unrelated edit
        manager_store.upsert_position("fund_iv", PositionUpsert(nav=21_000_000))
        pos = manager_store.get_position("fund_iv")
        assert pos.called_amount == 10_000_000
        assert pos.has_notices is False

    def test_list_sorted_by_due_date(self, client):
        _fund()
        client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 1, "due_date": "2026-09-01"})
        client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 2, "due_date": "2026-08-01"})
        due = [n["due_date"] for n in client.get("/deals/fund_iv/call-notices").json()]
        assert due == ["2026-08-01", "2026-09-01"]

    def test_analyst_cannot_create(self, analyst_client, grant_analyst_access):
        _fund()
        grant_analyst_access("fund_iv")
        r = analyst_client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 1})
        assert r.status_code == 403

    def test_analyst_can_read(self, client, analyst_client, grant_analyst_access):
        _fund()
        grant_analyst_access("fund_iv")
        client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 1})
        assert analyst_client.get("/deals/fund_iv/call-notices").status_code == 200


# ── Side-letter obligations + checks ──

class TestSideLetters:
    def _seed_obligation(self, deal_id="fund_iv"):
        _add_doc(deal_id, "sl_doc")
        return side_letter_store.create_obligations(deal_id, "sl_doc", [
            ObligationDraft(category="fee", text="10bps management fee discount", cadence="ongoing",
                            verify_hint="check the fee line on the capital account"),
        ])[0]

    def test_create_and_list(self, client):
        _fund()
        _add_doc("fund_iv", "sl_doc")
        r = client.post("/deals/fund_iv/side-letters/obligations", json={
            "doc_id": "sl_doc",
            "obligations": [
                {"category": "mfn", "text": "MFN on fee terms", "cadence": "ongoing"},
                {"category": "reporting", "text": "Monthly NAV reporting", "cadence": "ongoing"},
            ],
        })
        assert r.status_code == 200
        assert len(r.json()) == 2
        listed = client.get("/deals/fund_iv/side-letters/obligations").json()
        assert {o["category"] for o in listed} == {"mfn", "reporting"}
        assert all(o["latest_check"] is None for o in listed)

    def test_check_propose_then_confirm(self, client):
        _fund()
        ob = self._seed_obligation()
        # Simulate a proposed check (verifier would create this; do it via store)
        check = side_letter_store.upsert_check(
            obligation_id=ob.id, period="2026-Q2", verdict="breach",
            rationale="fee not discounted", citations=[], llm_verdict="breach", confirmed_by=None,
        )
        assert check.confirmed is False

        # Analyst overrides breach → compliant; llm_verdict retained
        r = client.patch(f"/deals/fund_iv/side-letters/checks/{check.id}", json={
            "verdict": "compliant", "rationale": "confirmed discount applied off-statement",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["verdict"] == "compliant"
        assert body["llm_verdict"] == "breach"
        assert body["confirmed"] is True

    def test_check_confirm_accepts_proposal(self, client):
        _fund()
        ob = self._seed_obligation()
        check = side_letter_store.upsert_check(
            obligation_id=ob.id, period="2026-Q2", verdict="compliant",
            rationale="ok", citations=[], llm_verdict="compliant", confirmed_by=None,
        )
        r = client.patch(f"/deals/fund_iv/side-letters/checks/{check.id}", json={})
        assert r.json()["verdict"] == "compliant"
        assert r.json()["confirmed"] is True

    def test_check_cross_fund_guard(self, client):
        _fund()
        deal_store.create_deal(DealCreate(deal_id="other_fund", name="Other", entity_type="fund",
                                          manager_id="hillpath", stage="Monitoring"))
        ob = self._seed_obligation()
        check = side_letter_store.upsert_check(
            obligation_id=ob.id, period="2026-Q2", verdict="unclear",
            rationale="", citations=[], llm_verdict="unclear", confirmed_by=None,
        )
        # Confirming via the wrong fund's route 404s
        r = client.patch(f"/deals/other_fund/side-letters/checks/{check.id}", json={})
        assert r.status_code == 404

    def test_analyst_cannot_verify_or_confirm(self, analyst_client, grant_analyst_access):
        _fund()
        grant_analyst_access("fund_iv")
        assert analyst_client.post("/deals/fund_iv/side-letters/verify", json={"period": "2026-Q2"}).status_code == 403


# ── Portfolio access filtering ──

class TestPortfolio:
    def test_positions_and_notices_filtered_by_access(self, client, analyst_client, analyst_user):
        _fund("fund_iv")
        deal_store.create_deal(DealCreate(deal_id="fund_v", name="Fund V", entity_type="fund",
                                          manager_id="hillpath", stage="Monitoring"))
        manager_store.upsert_position("fund_iv", PositionUpsert(commitment_amount=25_000_000, called_amount=5_000_000))
        manager_store.upsert_position("fund_v", PositionUpsert(commitment_amount=10_000_000))
        client.post("/deals/fund_iv/call-notices", json={"kind": "call", "amount": 5_000_000, "due_date": "2026-08-14"})
        client.post("/deals/fund_v/call-notices", json={"kind": "call", "amount": 2_000_000, "due_date": "2026-09-14"})

        # Admin sees both funds
        assert len(client.get("/portfolio/positions").json()) == 2
        assert len(client.get("/portfolio/call-notices").json()) == 2

        # Analyst with access to only fund_iv sees one
        grant_deal_access(analyst_user.id, "fund_iv", role="analyst")
        pos = analyst_client.get("/portfolio/positions").json()
        assert [p["deal_id"] for p in pos] == ["fund_iv"]
        assert pos[0]["unfunded"] == 20_000_000
        notices = analyst_client.get("/portfolio/call-notices").json()
        assert [n["deal_id"] for n in notices] == ["fund_iv"]
        assert notices[0]["fund_name"] == "Hillpath Fund IV"

    def test_compliance_lists_only_flagged(self, client):
        _fund("fund_iv")
        _add_doc("fund_iv", "sl")
        obligations = side_letter_store.create_obligations("fund_iv", "sl", [
            ObligationDraft(category="fee", text="fee discount"),
            ObligationDraft(category="mfn", text="mfn clause"),
        ])
        # One breach, one compliant
        side_letter_store.upsert_check(obligations[0].id, "2026-Q2", "breach", "", [], "breach", None)
        side_letter_store.upsert_check(obligations[1].id, "2026-Q2", "compliant", "", [], "compliant", None)
        flagged = client.get("/portfolio/compliance").json()
        assert [o["text"] for o in flagged] == ["fee discount"]
