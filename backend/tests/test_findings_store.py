"""Findings + brief-overrides persistence (Plan F3.4, D2).

Covers CRUD roundtrips, deal-scoped access (cross-deal denied, RBAC parity
with documents), 404 on unknown deal, and CASCADE cleanup on deal delete.
"""

SAMPLE_FINDINGS = [
    {"id": "f1", "sev": "material", "title": "Customer concentration", "status": "open", "origin": "scan"},
    {"id": "f2", "sev": "deal-breaker", "title": "Revenue recognition", "status": "confirmed", "origin": "scan"},
]
SAMPLE_OVERRIDES = {"snapshot": {"Seller": "Acme Holdings LP"}, "transaction": {"Timing": "Q3 2026"}}


def test_findings_roundtrip(client, sample_deal):
    # Empty by default.
    r = client.get("/deals/test_deal/findings")
    assert r.status_code == 200
    assert r.json() == {"findings": []}

    # PUT replaces the whole collection; GET returns it verbatim.
    r = client.put("/deals/test_deal/findings", json={"findings": SAMPLE_FINDINGS})
    assert r.status_code == 200
    assert r.json()["findings"] == SAMPLE_FINDINGS

    r = client.get("/deals/test_deal/findings")
    assert r.json()["findings"] == SAMPLE_FINDINGS

    # PUT again replaces (not appends).
    client.put("/deals/test_deal/findings", json={"findings": [SAMPLE_FINDINGS[0]]})
    assert client.get("/deals/test_deal/findings").json()["findings"] == [SAMPLE_FINDINGS[0]]


def test_overrides_roundtrip(client, sample_deal):
    r = client.get("/deals/test_deal/brief-overrides")
    assert r.status_code == 200
    assert r.json() == {"overrides": {}}

    r = client.put("/deals/test_deal/brief-overrides", json={"overrides": SAMPLE_OVERRIDES})
    assert r.status_code == 200
    assert r.json()["overrides"] == SAMPLE_OVERRIDES

    assert client.get("/deals/test_deal/brief-overrides").json()["overrides"] == SAMPLE_OVERRIDES


def test_cross_deal_access_denied(analyst_client, sample_deal):
    # Analyst without a deal_access grant is denied read + write on both blobs.
    for method, path, body in [
        ("get", "/deals/test_deal/findings", None),
        ("put", "/deals/test_deal/findings", {"findings": SAMPLE_FINDINGS}),
        ("get", "/deals/test_deal/brief-overrides", None),
        ("put", "/deals/test_deal/brief-overrides", {"overrides": SAMPLE_OVERRIDES}),
    ]:
        r = getattr(analyst_client, method)(path, **({"json": body} if body else {}))
        assert r.status_code == 403, f"{method} {path} should be forbidden without access"


def test_analyst_with_access_can_read_write(analyst_client, grant_analyst_access, sample_deal):
    # RBAC parity with documents: a granted analyst (non-admin) can read + write.
    grant_analyst_access("test_deal")
    r = analyst_client.put("/deals/test_deal/findings", json={"findings": SAMPLE_FINDINGS})
    assert r.status_code == 200
    assert analyst_client.get("/deals/test_deal/findings").json()["findings"] == SAMPLE_FINDINGS

    r = analyst_client.put("/deals/test_deal/brief-overrides", json={"overrides": SAMPLE_OVERRIDES})
    assert r.status_code == 200
    assert analyst_client.get("/deals/test_deal/brief-overrides").json()["overrides"] == SAMPLE_OVERRIDES


def test_unknown_deal_404(client):
    assert client.get("/deals/nope/findings").status_code == 404
    assert client.put("/deals/nope/findings", json={"findings": []}).status_code == 404
    assert client.get("/deals/nope/brief-overrides").status_code == 404


def test_blobs_cascade_on_deal_delete(client, sample_deal):
    from app.services import finding_store

    client.put("/deals/test_deal/findings", json={"findings": SAMPLE_FINDINGS})
    client.put("/deals/test_deal/brief-overrides", json={"overrides": SAMPLE_OVERRIDES})
    assert finding_store.get_findings("test_deal") == SAMPLE_FINDINGS

    assert client.delete("/deals/test_deal").status_code == 200
    # FK ondelete=CASCADE (SQLite pragma is on) clears the work-product blobs.
    assert finding_store.get_findings("test_deal") == []
    assert finding_store.get_overrides("test_deal") == {}
