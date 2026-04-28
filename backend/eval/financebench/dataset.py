"""Load the FinanceBench open-source dataset (150 annotated questions over public SEC filings).

Expected layout under ``--financebench-dir``:
    data/financebench_open_source.jsonl
    pdfs/<doc_name>.pdf
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class FBEvidence:
    text: str
    doc_name: str
    page_num: int  # 1-indexed PDF page


@dataclass
class FBQuestion:
    qid: str
    company: str
    doc_name: str  # primary source filename, no extension
    question: str
    answer: str  # ground truth
    justification: str
    question_type: str
    evidence: list[FBEvidence]


def load_questions(
    financebench_dir: Path,
    limit: int | None = None,
    doc_names: set[str] | None = None,
) -> list[FBQuestion]:
    """Load FinanceBench questions, optionally filtered to a set of source PDFs.

    Filter is applied before ``limit``, so ``limit`` counts questions that
    match ``doc_names``.
    """
    jsonl_path = financebench_dir / "data" / "financebench_open_source.jsonl"
    if not jsonl_path.exists():
        raise FileNotFoundError(
            f"FinanceBench dataset not found at {jsonl_path}. "
            "Clone https://github.com/patronus-ai/financebench and pass its root via --financebench-dir."
        )

    questions: list[FBQuestion] = []
    with jsonl_path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            doc_name = row.get("doc_name", "") or ""
            if doc_names and doc_name not in doc_names:
                continue
            evidence = [
                FBEvidence(
                    text=e.get("evidence_text", "") or "",
                    doc_name=e.get("evidence_doc_name", "") or "",
                    page_num=int(e.get("evidence_page_num", 0) or 0),
                )
                for e in (row.get("evidence") or [])
            ]
            questions.append(
                FBQuestion(
                    qid=row["financebench_id"],
                    company=row.get("company", "") or "",
                    doc_name=doc_name,
                    question=row["question"],
                    answer=row.get("answer", "") or "",
                    justification=row.get("justification", "") or "",
                    question_type=row.get("question_type", "") or "",
                    evidence=evidence,
                )
            )
            if limit is not None and len(questions) >= limit:
                break
    return questions


def pdf_path_for(financebench_dir: Path, doc_name: str) -> Path:
    return financebench_dir / "pdfs" / f"{doc_name}.pdf"
