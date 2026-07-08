# Plan 3 — Durable Ingestion & Parsing Throughput

> **Status: COMPLETED 2026-07-03** — shipped in PR #91 alongside Plan 1. Concurrency decision resolved as (a): bounded in-process pool over DB job rows, structured to lift into a separate worker process in Plan 5. Task 3.3's manual smoke check is documented in the PR description.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Checkbox steps, commit per task.

**Source:** `docs/assessments/2026-07-02-resiliency-security-assessment.md` — R4, R5.

**Goal:** Make document ingestion durable and observable across restarts (R4), and unblock the "upload a whole data room" throughput wall (R5). This is the exact path an LP hits when uploading 10s–100s of documents.

**Prerequisite:** none hard, but best after Plan 1. Works on the current stack (SQLite + in-process). The *durability* pattern here (DB-backed jobs + startup reconciler) mirrors the workflow-run fix already shipped, and sets up cleanly for the DB-as-queue move in Plan 5.

**Decision required before Task 3.2:** parsing concurrency model. Options: (a) **thread/process pool inside the API process** with a bounded worker count (simplest, single-node); (b) **DB-backed job queue + separate worker process** (scales, but overlaps Plan 5's DB-as-queue). **Recommended: (a) now, structured so it lifts into (b) later** — keep the job rows and reconciler from Task 3.1 as the seam. Confirm before implementing.

---

## Findings addressed

| ID | Finding | File |
|---|---|---|
| R4 | Ingestion is `asyncio.create_task` in the API process with in-memory progress and **no reconciler** — a restart mid-ingest orphans documents at "processing" forever | `app/api/routes_ingest.py:266`, `_ingest_progress` |
| R5 | Docling runs one job at a time (`docling_max_concurrent_jobs=1`), queue depth 2 → uploading 100 PDFs serializes into hours | `app/config.py`, `app/services/parser.py` |

---

## Task 3.1 — Persist ingest jobs + startup reconciler (R4)

Move ingest state from an in-memory dict to the DB so it survives restarts, is visible to any worker, and can be reconciled.

**Files:** `app/database.py` (new `IngestJobRow`), new `app/services/ingest_store.py`, modify `app/api/routes_ingest.py`, `app/main.py` (reconciler call); `tests/test_ingest_durability.py`.

- [x] **Step 1: Schema.** `IngestJobRow(id, deal_id, filename, file_path, status[queued|parsing|embedding|complete|error], stage, percent, detail, doc_id, created_at, updated_at)`. Replace `_ingest_progress` reads/writes with this table.
- [x] **Step 2: Reconciler.** `reconcile_interrupted_ingests()` — any job in `queued|parsing|embedding` at startup → `error` with detail "Interrupted by server restart" (or re-queue if Task 3.2's queue exists). Call from `main.py` startup next to `reconcile_interrupted_runs`. **Failing test first:** seed an in-flight job, run reconciler, assert it's errored; a `complete` job is untouched.
- [x] **Step 3: Progress endpoint reads the table.** `GET /deals/{id}/documents/progress/{job_id}` returns the row. Frontend already polls progress — keep the response shape compatible.
- [x] **Step 4:** Verify + commit — `feat(ingest): durable DB-backed ingest jobs + restart reconciler`

## Task 3.2 — Parsing worker pool + backpressure (R5)

**Files:** modify `app/config.py`, `app/services/parser.py` (or a new `app/services/ingest_worker.py`), `app/api/routes_ingest.py`; `tests/test_ingest_throughput.py`.

- [x] **Step 1: Bounded worker pool.** Per the decision above, process queued `IngestJobRow`s with a configurable pool (`INGEST_WORKERS`, default 2–4 depending on CPU), each claiming a job atomically (`queued → parsing`, same claim pattern as workflow cells). Docling stays subprocess-isolated per job.
- [x] **Step 2: Backpressure + limits.** Add a max upload size (`MAX_UPLOAD_MB`) and a per-deal in-flight cap; a full queue returns a clear 429/202 with the job id rather than blocking the request. Batch upload enqueues N jobs and returns immediately with job ids.
- [x] **Step 3: Tests.** Enqueuing many jobs processes them with bounded concurrency (assert no more than `INGEST_WORKERS` in `parsing` at once); oversized upload rejected; batch returns job ids without waiting for parse.
- [x] **Step 4:** Verify + commit — `feat(ingest): bounded parsing worker pool with backpressure`

## Task 3.3 — Throughput smoke (manual, documented)

- [x] Document a manual check in the PR: upload ~25 small PDFs via batch, confirm all reach `complete`, jobs visible in the ingest table, and a mid-batch backend restart leaves interrupted jobs `error` (recoverable via re-upload) rather than stuck `processing`.

---

## Definition of done
- New tests pass, full `pytest -v` green, one commit per task.
- After a restart, no document is ever stuck in a non-terminal ingest state.
- Structured so the worker pool can lift into a separate process (Plan 5) without touching the job schema.
