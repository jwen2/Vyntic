"""Extraction quality eval runner.

Makes real, billable Gemini calls — deliberately outside `tests/` so CI
never runs it (pytest.ini sets testpaths = tests).

Usage, from backend/:
    python -m evals.run_eval --golden evals/data/example_golden_set.json \
                             --docs evals/data
"""
import argparse
import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from app.services.context_provider import _full_text_to_chunks
from app.services.extraction_engine import run_extraction
from evals.golden_set import load_golden_set
from evals.scoring import aggregate, score_question


async def _run_one(question, docs_dir: Path):
    doc_path = docs_dir / question.doc_filename
    chunks = _full_text_to_chunks(
        doc_path.read_text(encoding="utf-8"),
        question.doc_filename,
        f"eval-{question.doc_filename}",
    )
    result = await run_extraction(
        chunks, question.question, require_citations=True
    )
    return score_question(question, result.citations), result


async def main_async(golden_path: Path, docs_dir: Path, out_path: Path | None):
    questions = load_golden_set(golden_path)
    scores = []

    for q in questions:
        score, result = await _run_one(q, docs_dir)
        scores.append(score)
        mark = "HIT " if score.hit else "MISS"
        print(
            f"{mark} {q.id:<20} expected={list(score.expected_pages)} "
            f"cited={list(score.cited_pages)} precision={score.precision:.2f}"
        )
        if not score.hit:
            print(f"       answer: {result.answer[:200]}")

    report = aggregate(scores)
    print()
    print(f"hit_rate         {report.hit_rate:.3f}")
    print(f"mean_precision   {report.mean_precision:.3f}")
    print(f"no_citation_rate {report.no_citation_rate:.3f}")
    print(f"questions        {len(report.scores)}")

    if out_path:
        out_path.write_text(
            json.dumps(
                {
                    "hit_rate": report.hit_rate,
                    "mean_precision": report.mean_precision,
                    "no_citation_rate": report.no_citation_rate,
                    "scores": [asdict(s) for s in report.scores],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nwrote {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Run the extraction quality eval.")
    parser.add_argument("--golden", required=True, type=Path)
    parser.add_argument("--docs", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    asyncio.run(main_async(args.golden, args.docs, args.out))


if __name__ == "__main__":
    main()
