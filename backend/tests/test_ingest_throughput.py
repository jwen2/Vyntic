"""Bounded parsing worker pool + backpressure (R5).

Before this fix background ingestion was one unbounded asyncio.create_task
per large file, Docling was gated to one job at a time, and a batch upload
parsed every small file serially inside the request.
"""
import asyncio
import io

import pytest

from app.config import settings
from app.services import ingest_store, ingest_worker


def _enqueue(n, deal_id="test_deal"):
    return [
        ingest_worker.enqueue_file(deal_id, f"/uploads/f{i}.pdf", f"f{i}.pdf")
        for i in range(n)
    ]


class TestWorkerPool:
    def test_bounded_concurrency(self, sample_deal, monkeypatch):
        monkeypatch.setattr(settings, "ingest_workers", 2)
        active = 0
        peak = 0

        async def fake_pipeline(job):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.02)
            active -= 1

        monkeypatch.setattr(ingest_worker, "_run_pipeline", fake_pipeline)

        async def main():
            _enqueue(6)
            await ingest_worker.drain_queue()

        asyncio.run(main())
        assert peak <= 2

    def test_all_jobs_reach_complete(self, sample_deal, monkeypatch):
        monkeypatch.setattr(settings, "ingest_workers", 3)

        async def fake_pipeline(job):
            await asyncio.sleep(0)

        monkeypatch.setattr(ingest_worker, "_run_pipeline", fake_pipeline)
        job_ids = []

        async def main():
            job_ids.extend(_enqueue(5))
            await ingest_worker.drain_queue()

        asyncio.run(main())
        for job_id in job_ids:
            assert ingest_store.get_job(job_id)["status"] == "complete"

    def test_pipeline_failure_marks_job_error(self, sample_deal, monkeypatch):
        async def fake_pipeline(job):
            raise RuntimeError("docling exploded")

        monkeypatch.setattr(ingest_worker, "_run_pipeline", fake_pipeline)
        job_ids = []

        async def main():
            job_ids.extend(_enqueue(1))
            await ingest_worker.drain_queue()

        asyncio.run(main())
        job = ingest_store.get_job(job_ids[0])
        assert job["status"] == "error"
        assert "docling exploded" in job["detail"]


class TestClaim:
    def test_claims_are_exclusive_and_ordered(self, sample_deal):
        job_ids = _enqueue(2)
        first = ingest_store.claim_next_job()
        second = ingest_store.claim_next_job()
        assert {first["id"], second["id"]} == set(job_ids)
        assert ingest_store.claim_next_job() is None
        assert ingest_store.get_job(first["id"])["status"] == "parsing"


class TestParentAggregation:
    def test_parent_completes_when_all_children_complete(self, sample_deal, monkeypatch):
        async def fake_pipeline(job):
            await asyncio.sleep(0)

        monkeypatch.setattr(ingest_worker, "_run_pipeline", fake_pipeline)

        async def main():
            for i in range(3):
                ingest_worker.enqueue_file(
                    "test_deal", f"/uploads/b{i}.pdf", f"b{i}.pdf", parent_id="batch1"
                )
            await ingest_worker.drain_queue()

        asyncio.run(main())
        parent = ingest_store.get_job("batch1")
        assert parent["status"] == "complete"
        assert parent["percent"] == 100

    def test_parent_errors_when_a_child_fails(self, sample_deal, monkeypatch):
        async def fake_pipeline(job):
            if job["filename"] == "bad.pdf":
                raise RuntimeError("unparseable")

        monkeypatch.setattr(ingest_worker, "_run_pipeline", fake_pipeline)

        async def main():
            ingest_worker.enqueue_file(
                "test_deal", "/uploads/good.pdf", "good.pdf", parent_id="batch2"
            )
            ingest_worker.enqueue_file(
                "test_deal", "/uploads/bad.pdf", "bad.pdf", parent_id="batch2"
            )
            await ingest_worker.drain_queue()

        asyncio.run(main())
        parent = ingest_store.get_job("batch2")
        assert parent["status"] == "error"
        assert "bad.pdf" in parent["detail"]


class TestBackpressure:
    def test_oversized_upload_rejected(self, client, sample_deal, monkeypatch):
        monkeypatch.setattr(settings, "max_upload_mb", 1)
        big = io.BytesIO(b"x" * (2 * 1024 * 1024))
        resp = client.post(
            "/deals/test_deal/documents",
            files={"file": ("big.txt", big, "text/plain")},
        )
        assert resp.status_code == 413

    def test_per_deal_inflight_cap_returns_429(self, client, sample_deal, monkeypatch):
        monkeypatch.setattr(settings, "ingest_max_inflight_per_deal", 2)
        _enqueue(2)
        files = [
            ("files", (f"t{i}.txt", io.BytesIO(b"hello"), "text/plain"))
            for i in range(3)
        ]
        resp = client.post("/deals/test_deal/documents/batch", files=files)
        assert resp.status_code == 429


class TestBatchEnqueue:
    def test_batch_returns_job_ids_without_parsing(self, client, sample_deal, monkeypatch):
        async def fake_pipeline(job):  # must never run inside the request
            raise AssertionError("batch request should not parse inline")

        monkeypatch.setattr(ingest_worker, "_run_pipeline", fake_pipeline)
        monkeypatch.setattr(ingest_worker, "ensure_started", lambda: None)

        files = [
            ("files", (f"t{i}.txt", io.BytesIO(b"hello"), "text/plain"))
            for i in range(3)
        ]
        resp = client.post(
            "/deals/test_deal/documents/batch?upload_id=up1", files=files
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 3
        for meta in body:
            job = ingest_store.get_job(meta["doc_id"])  # doc_id carries the job id
            assert job is not None
            assert job["status"] == "queued"
        # Aggregate row the frontend polls exists and is non-terminal
        parent = ingest_store.get_job("up1")
        assert parent["status"] not in ("complete", "error")


class TestReconcilerResume:
    def test_queued_jobs_with_saved_files_survive_restart(self, sample_deal):
        job_ids = _enqueue(2)
        assert ingest_store.reconcile_interrupted_ingests() == 0
        for job_id in job_ids:
            assert ingest_store.get_job(job_id)["status"] == "queued"
