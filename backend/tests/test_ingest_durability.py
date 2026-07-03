"""Durable DB-backed ingest jobs + restart reconciler (R4).

Before this fix ingest progress lived in an in-process dict and background
ingestion was a bare asyncio.create_task — a restart mid-ingest orphaned
documents at "processing" forever with no record of what was in flight.
"""
from app.services import ingest_store


def _seed(job_id, deal_id="test_deal", **kwargs):
    defaults = dict(
        status="parsing",
        stage="Parsing document",
        percent=40,
        filename="doc.pdf",
    )
    defaults.update(kwargs)
    ingest_store.set_progress(job_id, deal_id=deal_id, **defaults)


class TestJobStore:
    def test_set_progress_creates_and_updates_a_row(self, sample_deal):
        _seed("job1", status="queued", stage="Saving upload", percent=10)
        job = ingest_store.get_job("job1")
        assert job["upload_id"] == "job1"
        assert job["status"] == "queued"
        assert job["stage"] == "Saving upload"
        assert job["percent"] == 10
        assert job["filename"] == "doc.pdf"

        _seed("job1", status="embedding", stage="Embedding chunks", percent=85)
        job = ingest_store.get_job("job1")
        assert job["status"] == "embedding"
        assert job["percent"] == 85

    def test_get_job_returns_none_for_unknown_id(self, sample_deal):
        assert ingest_store.get_job("nope") is None

    def test_none_job_id_is_a_noop(self, sample_deal):
        ingest_store.set_progress(
            None, deal_id="test_deal", status="parsing", stage="x", percent=1
        )


class TestReconciler:
    def test_in_flight_jobs_are_errored_on_restart(self, sample_deal):
        _seed("j_queued", status="queued", stage="Saving upload", percent=5)
        _seed("j_parsing", status="parsing", stage="Parsing document", percent=40)
        _seed("j_embedding", status="embedding", stage="Embedding chunks", percent=80)
        _seed("j_done", status="complete", stage="Complete", percent=100)
        _seed("j_failed", status="error", stage="Parsing failed", percent=40)

        reconciled = ingest_store.reconcile_interrupted_ingests()
        assert reconciled == 3

        for job_id in ("j_queued", "j_parsing", "j_embedding"):
            job = ingest_store.get_job(job_id)
            assert job["status"] == "error"
            assert "restart" in job["detail"].lower()

        assert ingest_store.get_job("j_done")["status"] == "complete"
        assert ingest_store.get_job("j_failed")["stage"] == "Parsing failed"

    def test_reconciler_is_idempotent(self, sample_deal):
        _seed("j1", status="parsing")
        assert ingest_store.reconcile_interrupted_ingests() == 1
        assert ingest_store.reconcile_interrupted_ingests() == 0


class TestProgressEndpoint:
    def test_progress_endpoint_reads_the_table(self, client, sample_deal):
        _seed("job_api", status="parsing", percent=42)
        resp = client.get("/deals/test_deal/documents/progress/job_api")
        assert resp.status_code == 200
        body = resp.json()
        assert body["upload_id"] == "job_api"
        assert body["status"] == "parsing"
        assert body["percent"] == 42
        # Shape stays compatible with the old in-memory dict response
        assert set(body) == {
            "upload_id", "status", "stage", "percent", "filename", "detail",
        }

    def test_progress_endpoint_404_for_unknown_job(self, client, sample_deal):
        resp = client.get("/deals/test_deal/documents/progress/missing")
        assert resp.status_code == 404
