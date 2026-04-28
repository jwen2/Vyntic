"""End-to-end FinanceBench eval runner against the Vyntic single-document RAG path.

Pipeline per run:
  1. Load N questions from financebench_open_source.jsonl
  2. Ingest each unique source PDF into a single Vyntic deal ("financebench")
     via the same parser/chunker/embedder used by the API. Re-runs are
     idempotent — already-ingested filenames are skipped.
  3. For each question, call answer_document_question(deal_id, doc_id, q)
     — the closest analog to FinanceBench's "find the answer in this filing".
  4. Score: page-level groundedness + LLM-judge accuracy + refusal heuristic.
  5. Write per-question JSONL + summary.json.

Run from backend/:
  python -m eval.financebench.runner \\
    --financebench-dir ~/datasets/financebench \\
    --limit 10 \\
    --out eval/financebench/results/run.jsonl
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

# Make ``app.*`` importable when the runner is invoked from anywhere.
_HERE = Path(__file__).resolve()
_BACKEND_DIR = _HERE.parents[2]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.agents.single_deal_qa import answer_document_question  # noqa: E402
from app.database import init_db  # noqa: E402
from app.models.deal import DealCreate  # noqa: E402
from app.services import deal_store  # noqa: E402
from app.services.chunker import chunk_sections  # noqa: E402
from app.services.parser import parse_document_path  # noqa: E402
from app.services.vector_store import upsert_chunks  # noqa: E402

from eval.financebench.dataset import (  # noqa: E402
    FBQuestion,
    load_questions,
    pdf_path_for,
)
from eval.financebench.scorer import (  # noqa: E402
    judge_answer,
    looks_like_refusal,
    score_groundedness,
)

DEAL_ID = "financebench"
DEAL_NAME = "FinanceBench Eval"


def ensure_deal() -> None:
    # The runner bypasses FastAPI startup, so make sure the SQLite schema exists.
    init_db()
    if deal_store.get_deal(DEAL_ID) is None:
        deal_store.create_deal(
            DealCreate(
                deal_id=DEAL_ID,
                name=DEAL_NAME,
                description="Auto-created by eval/financebench/runner.py",
                stage="Screening",
                tags=["eval"],
            )
        )


async def ensure_ingested(financebench_dir: Path, doc_names: set[str]) -> dict[str, str]:
    """Ingest each requested source PDF (idempotent). Returns {doc_name: doc_id}."""
    existing = {d.filename: d.doc_id for d in deal_store.list_documents(DEAL_ID)}
    name_to_doc_id: dict[str, str] = {}

    for doc_name in sorted(doc_names):
        if not doc_name:
            continue
        filename = f"{doc_name}.pdf"
        if filename in existing:
            name_to_doc_id[doc_name] = existing[filename]
            continue

        pdf_path = pdf_path_for(financebench_dir, doc_name)
        if not pdf_path.exists():
            print(f"  ! missing PDF: {pdf_path} — skipping questions referencing it")
            continue

        print(f"  ingesting {filename}...", flush=True)
        t0 = time.monotonic()
        doc_meta, sections = await parse_document_path(pdf_path, filename, DEAL_ID)
        chunks = chunk_sections(sections, DEAL_ID, doc_meta.doc_id)
        doc_meta.chunk_count = len(chunks)
        await upsert_chunks(DEAL_ID, chunks)
        deal_store.increment_doc_count(DEAL_ID)
        deal_store.add_document(DEAL_ID, doc_meta)
        name_to_doc_id[doc_name] = doc_meta.doc_id
        print(
            f"    -> {len(sections)} pages, {len(chunks)} chunks, "
            f"{time.monotonic() - t0:.1f}s"
        )

    return name_to_doc_id


@dataclass
class QResult:
    qid: str
    company: str
    doc_name: str
    question_type: str
    question: str
    ground_truth: str
    model_answer: str
    cited_pages: list[int]
    expected_pages: list[int]
    page_hit: bool
    page_hit_within_1: bool
    judge_label: str
    judge_rationale: str
    refusal_heuristic: bool
    duration_ms: int
    error: str | None = None


async def run_one(
    q: FBQuestion,
    doc_id: str | None,
    judge_model: str | None,
    page_offset: int = 1,
) -> QResult:
    # FinanceBench evidence_page_num is 0-indexed (first page = 0), but Docling
    # and therefore Vyntic citations are 1-indexed. Shift by +1 to align.
    expected_pages = sorted({e.page_num + page_offset for e in q.evidence if e.page_num is not None})
    base = QResult(
        qid=q.qid,
        company=q.company,
        doc_name=q.doc_name,
        question_type=q.question_type,
        question=q.question,
        ground_truth=q.answer,
        model_answer="",
        cited_pages=[],
        expected_pages=expected_pages,
        page_hit=False,
        page_hit_within_1=False,
        judge_label="ERROR",
        judge_rationale="",
        refusal_heuristic=False,
        duration_ms=0,
    )

    if doc_id is None:
        base.error = "doc not ingested"
        return base

    t0 = time.monotonic()
    try:
        resp = await answer_document_question(DEAL_ID, doc_id, q.question)
    except Exception as e:
        base.error = f"query failed: {e}"
        base.duration_ms = int((time.monotonic() - t0) * 1000)
        return base
    base.duration_ms = int((time.monotonic() - t0) * 1000)

    base.model_answer = resp.answer
    base.cited_pages = sorted({c.page for c in resp.citations if c is not None})

    g = score_groundedness(expected_pages, base.cited_pages)
    base.page_hit = g.page_hit
    base.page_hit_within_1 = g.page_hit_within_1
    base.refusal_heuristic = looks_like_refusal(resp.answer)

    judge = await judge_answer(q.question, q.answer, resp.answer, judge_model=judge_model)
    base.judge_label = judge.label
    base.judge_rationale = judge.rationale

    return base


def summarize(results: list[QResult]) -> dict:
    n = len(results)
    if n == 0:
        return {"n": 0}
    by_label: dict[str, int] = {}
    for r in results:
        by_label[r.judge_label] = by_label.get(r.judge_label, 0) + 1
    page_hits = sum(1 for r in results if r.page_hit)
    page_hits_w1 = sum(1 for r in results if r.page_hit_within_1)
    refusals = sum(1 for r in results if r.refusal_heuristic)
    errors = sum(1 for r in results if r.error)
    avg_ms = sum(r.duration_ms for r in results) / n
    return {
        "n": n,
        "judge_breakdown": by_label,
        "accuracy": round(by_label.get("CORRECT", 0) / n, 3),
        "page_hit_exact": round(page_hits / n, 3),
        "page_hit_within_1": round(page_hits_w1 / n, 3),
        "refusal_heuristic_rate": round(refusals / n, 3),
        "errors": errors,
        "avg_query_ms": int(avg_ms),
    }


def print_summary(summary: dict) -> None:
    print()
    print("=" * 60)
    print("FinanceBench eval summary")
    print("=" * 60)
    for k, v in summary.items():
        print(f"  {k}: {v}")


async def amain(args: argparse.Namespace) -> int:
    fb_dir = Path(args.financebench_dir).expanduser().resolve()

    doc_names_filter: set[str] | None = None
    if args.doc_names:
        doc_names_filter = {n.strip() for n in args.doc_names.split(",") if n.strip()}

    print(
        f"Loading questions from {fb_dir} "
        f"(limit={args.limit}, doc_names={sorted(doc_names_filter) if doc_names_filter else 'ALL'})"
    )
    questions = load_questions(fb_dir, limit=args.limit, doc_names=doc_names_filter)
    print(f"  -> {len(questions)} questions")
    if not questions:
        print("No questions to run.")
        return 0

    ensure_deal()

    needed_docs = {q.doc_name for q in questions if q.doc_name}
    print(f"Ingesting {len(needed_docs)} unique source PDF(s) into deal '{DEAL_ID}'")
    name_to_doc_id = await ensure_ingested(fb_dir, needed_docs)

    print(f"Running {len(questions)} question(s)")
    results: list[QResult] = []
    for i, q in enumerate(questions, 1):
        doc_id = name_to_doc_id.get(q.doc_name)
        print(f"  [{i}/{len(questions)}] {q.qid} ({q.company}) ...", flush=True)
        r = await run_one(q, doc_id, judge_model=args.judge_model, page_offset=args.page_offset)
        tag = r.judge_label if not r.error else f"ERROR:{r.error[:40]}"
        print(f"      -> {tag}, page_hit={r.page_hit}, {r.duration_ms}ms")
        results.append(r)

    out_path = Path(args.out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        for r in results:
            f.write(json.dumps(asdict(r)) + "\n")
    print(f"\nWrote per-question results to {out_path}")

    summary = summarize(results)
    summary_path = out_path.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, indent=2))
    print_summary(summary)
    print(f"Wrote summary to {summary_path}")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(
        description="Run FinanceBench eval against the Vyntic RAG pipeline."
    )
    p.add_argument(
        "--financebench-dir",
        required=True,
        help="Path to a checkout of patronus-ai/financebench",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Number of questions to run (default 10). Applied AFTER --doc-names filter.",
    )
    p.add_argument(
        "--doc-names",
        default=None,
        help="Comma-separated list of FinanceBench doc_name values to restrict to "
        "(e.g. AMD_2022_10K,AMERICANEXPRESS_2022_10K). Applied before --limit.",
    )
    p.add_argument(
        "--out",
        default="eval/financebench/results/run.jsonl",
        help="Per-question JSONL output path",
    )
    p.add_argument(
        "--judge-model",
        default=None,
        help="Override judge model (default $FINANCEBENCH_JUDGE_MODEL or gemini-3-flash-preview)",
    )
    p.add_argument(
        "--page-offset",
        type=int,
        default=1,
        help="Add this to FinanceBench evidence_page_num before scoring "
        "(default 1, since FB pages are 0-indexed and Vyntic citations are 1-indexed)",
    )
    args = p.parse_args()
    sys.exit(asyncio.run(amain(args)))


if __name__ == "__main__":
    main()
