"""RBAC tests (F11).

The README documents create/delete deals, upload/delete documents, and stage
edits as admin-only; before these tests the API enforced none of it — any
analyst with deal access could delete the deal, its files, and its vectors.
"""
import pytest


@pytest.fixture
def deal(client):
    resp = client.post(
        "/deals",
        json={"deal_id": "rbac_deal", "name": "RBAC Deal", "stage": "Screening"},
    )
    assert resp.status_code == 200
    return resp.json()


class TestAnalystForbidden:
    def test_create_deal_forbidden(self, analyst_client):
        resp = analyst_client.post(
            "/deals", json={"deal_id": "nope", "name": "Nope"}
        )
        assert resp.status_code == 403

    def test_delete_deal_forbidden(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("rbac_deal")
        resp = analyst_client.delete("/deals/rbac_deal")
        assert resp.status_code == 403

    def test_stage_change_forbidden(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("rbac_deal")
        resp = analyst_client.patch("/deals/rbac_deal", json={"stage": "IC Review"})
        assert resp.status_code == 403

    def test_tags_change_allowed(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("rbac_deal")
        resp = analyst_client.patch("/deals/rbac_deal", json={"tags": ["Technology"]})
        assert resp.status_code == 200
        assert resp.json()["tags"] == ["Technology"]

    def test_upload_document_forbidden(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("rbac_deal")
        resp = analyst_client.post(
            "/deals/rbac_deal/documents",
            files={"file": ("t.txt", b"hello", "text/plain")},
        )
        assert resp.status_code == 403

    def test_delete_document_forbidden(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("rbac_deal")
        resp = analyst_client.delete("/deals/rbac_deal/documents/some_doc")
        assert resp.status_code == 403

    def test_no_deal_access_means_403_on_read(self, deal, analyst_client):
        resp = analyst_client.get("/deals/rbac_deal")
        assert resp.status_code == 403


class TestAdminAllowed:
    def test_admin_full_lifecycle(self, client):
        assert (
            client.post(
                "/deals", json={"deal_id": "adm_deal", "name": "Admin Deal"}
            ).status_code
            == 200
        )
        assert (
            client.patch("/deals/adm_deal", json={"stage": "IC Review"}).status_code
            == 200
        )
        assert client.delete("/deals/adm_deal").status_code == 200

    def test_analyst_with_access_can_read(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("rbac_deal")
        assert analyst_client.get("/deals/rbac_deal").status_code == 200
