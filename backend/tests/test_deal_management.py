"""
Tests for Phase 2: Deal Management features.
- Deal status & tags (PATCH endpoint)
- Multi-file batch upload
- Deal CRUD with new fields
"""
import io
import pytest
from unittest.mock import AsyncMock, patch


class TestDealStatusAndTags:
    """Test deal stage and tag management via PATCH /deals/{id}."""

    def test_create_deal_with_stage_and_tags(self, client):
        """Creating a deal includes stage and tags."""
        resp = client.post("/deals", json={
            "deal_id": "test_1",
            "name": "Test Corp",
            "stage": "Due Diligence",
            "tags": ["Technology", "Healthcare"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["stage"] == "Due Diligence"
        assert data["tags"] == ["Technology", "Healthcare"]

    def test_create_deal_defaults(self, client):
        """Deal defaults to Screening stage and empty tags."""
        resp = client.post("/deals", json={
            "deal_id": "test_2",
            "name": "Default Corp",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["stage"] == "Screening"
        assert data["tags"] == []

    def test_update_stage(self, client, sample_deal):
        """PATCH updates the deal stage."""
        resp = client.patch(f"/deals/{sample_deal.deal_id}", json={
            "stage": "IC Review",
        })
        assert resp.status_code == 200
        assert resp.json()["stage"] == "IC Review"

        # Verify persisted
        get_resp = client.get(f"/deals/{sample_deal.deal_id}")
        assert get_resp.json()["stage"] == "IC Review"

    def test_update_tags(self, client, sample_deal):
        """PATCH updates deal tags."""
        resp = client.patch(f"/deals/{sample_deal.deal_id}", json={
            "tags": ["Healthcare", "Consumer"],
        })
        assert resp.status_code == 200
        assert set(resp.json()["tags"]) == {"Healthcare", "Consumer"}

    def test_partial_update_preserves_other_fields(self, client, sample_deal):
        """PATCH only changes provided fields, preserves others."""
        client.patch(f"/deals/{sample_deal.deal_id}", json={
            "stage": "Closed",
        })
        resp = client.get(f"/deals/{sample_deal.deal_id}")
        data = resp.json()
        assert data["stage"] == "Closed"
        assert data["name"] == sample_deal.name  # unchanged
        assert data["tags"] == sample_deal.tags  # unchanged

    def test_update_nonexistent_deal(self, client):
        """PATCH on nonexistent deal returns 404."""
        resp = client.patch("/deals/nonexistent", json={"stage": "Closed"})
        assert resp.status_code == 404

    def test_list_deals_includes_stage_tags(self, client, three_deals):
        """GET /deals returns stage and tags for each deal."""
        resp = client.get("/deals")
        assert resp.status_code == 200
        deals = resp.json()
        assert len(deals) == 3
        for deal in deals:
            assert "stage" in deal
            assert "tags" in deal

    def test_metadata_stages_endpoint(self, client):
        """GET /deals/metadata/stages returns valid stage list."""
        resp = client.get("/deals/metadata/stages")
        assert resp.status_code == 200
        stages = resp.json()
        assert "Screening" in stages
        assert "IC Review" in stages
        assert "Closed" in stages

    def test_metadata_tags_endpoint(self, client):
        """GET /deals/metadata/tags returns sector tag list."""
        resp = client.get("/deals/metadata/tags")
        assert resp.status_code == 200
        tags = resp.json()
        assert "Technology" in tags
        assert "Healthcare" in tags


class TestMultiFileUpload:
    """Test batch document upload via POST /deals/{id}/documents/batch."""

    def _make_fake_pdf(self, name: str = "test.pdf") -> tuple:
        """Create a minimal fake PDF bytes tuple for upload."""
        content = b"%PDF-1.4 fake content"
        return (name, io.BytesIO(content), "application/pdf")

    def test_batch_upload_requires_deal(self, client):
        """Batch upload returns 404 for nonexistent deal."""
        files = [("files", self._make_fake_pdf())]
        resp = client.post("/deals/nonexistent/documents/batch", files=files)
        assert resp.status_code == 404

    def test_batch_upload_requires_files(self, client, sample_deal):
        """Batch upload returns 422 when no files provided."""
        resp = client.post(
            f"/deals/{sample_deal.deal_id}/documents/batch",
            files=[],
        )
        # FastAPI returns 422 for missing required field
        assert resp.status_code == 422

    @patch("app.api.routes_ingest.parse_document_path", new_callable=AsyncMock)
    @patch("app.api.routes_ingest.upsert_chunks", new_callable=AsyncMock)
    def test_batch_upload_multiple_files(self, mock_upsert, mock_parse, client, sample_deal):
        """Batch upload processes multiple files and returns metadata list."""
        from app.models.document import DocumentMetadata

        def make_meta(filename, deal_id):
            return DocumentMetadata(
                doc_id=f"doc_{filename}",
                deal_id=deal_id,
                filename=filename,
                page_count=5,
                chunk_count=0,
            ), []

        mock_parse.side_effect = [
            make_meta("doc1.pdf", sample_deal.deal_id),
            make_meta("doc2.pdf", sample_deal.deal_id),
        ]
        mock_upsert.return_value = None

        files = [
            ("files", ("doc1.pdf", io.BytesIO(b"%PDF"), "application/pdf")),
            ("files", ("doc2.pdf", io.BytesIO(b"%PDF"), "application/pdf")),
        ]
        resp = client.post(
            f"/deals/{sample_deal.deal_id}/documents/batch",
            files=files,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["filename"] == "doc1.pdf"
        assert data[1]["filename"] == "doc2.pdf"

    @patch("app.api.routes_ingest.parse_document_path", new_callable=AsyncMock)
    @patch("app.api.routes_ingest.upsert_chunks", new_callable=AsyncMock)
    def test_batch_upload_increments_doc_count(self, mock_upsert, mock_parse, client, sample_deal):
        """Batch upload increments deal document_count for each file."""
        from app.models.document import DocumentMetadata

        # Distinct doc_ids per parsed file — real ingestion generates a fresh
        # uuid per upload; a shared id collides on the documents primary key.
        mock_parse.side_effect = [
            (
                DocumentMetadata(
                    doc_id=f"doc_{i}",
                    deal_id=sample_deal.deal_id,
                    filename=name,
                    page_count=1,
                    chunk_count=0,
                ),
                [],
            )
            for i, name in enumerate(["a.pdf", "b.pdf"], start=1)
        ]
        mock_upsert.return_value = None

        files = [
            ("files", ("a.pdf", io.BytesIO(b"%PDF"), "application/pdf")),
            ("files", ("b.pdf", io.BytesIO(b"%PDF"), "application/pdf")),
        ]
        client.post(f"/deals/{sample_deal.deal_id}/documents/batch", files=files)

        resp = client.get(f"/deals/{sample_deal.deal_id}")
        assert resp.json()["document_count"] == 2

    @patch("app.api.routes_ingest.parse_document_path", new_callable=AsyncMock)
    def test_batch_upload_partial_failure(self, mock_parse, client, sample_deal):
        """Batch upload with all files failing returns 400."""
        mock_parse.side_effect = ValueError("Unsupported format")

        files = [
            ("files", ("bad.txt", io.BytesIO(b"text"), "text/plain")),
        ]
        resp = client.post(
            f"/deals/{sample_deal.deal_id}/documents/batch",
            files=files,
        )
        assert resp.status_code == 400


class TestDealCRUD:
    """Basic deal CRUD tests (regression coverage)."""

    def test_create_and_get_deal(self, client):
        """Create a deal and retrieve it by ID."""
        client.post("/deals", json={
            "deal_id": "crud_test",
            "name": "CRUD Test",
            "description": "Testing CRUD",
        })
        resp = client.get("/deals/crud_test")
        assert resp.status_code == 200
        assert resp.json()["name"] == "CRUD Test"

    def test_duplicate_deal_returns_409(self, client, sample_deal):
        """Creating a deal with existing ID returns 409."""
        resp = client.post("/deals", json={
            "deal_id": sample_deal.deal_id,
            "name": "Duplicate",
        })
        assert resp.status_code == 409

    def test_delete_deal(self, client, sample_deal):
        """Deleting a deal removes it from the store."""
        resp = client.delete(f"/deals/{sample_deal.deal_id}")
        assert resp.status_code == 200

        get_resp = client.get(f"/deals/{sample_deal.deal_id}")
        assert get_resp.status_code == 404

    def test_list_documents_empty(self, client, sample_deal):
        """New deal has no documents."""
        resp = client.get(f"/deals/{sample_deal.deal_id}/documents")
        assert resp.status_code == 200
        assert resp.json() == []
