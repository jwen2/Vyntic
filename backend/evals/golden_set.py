"""Golden-set definitions for extraction quality evaluation.

A golden question pins a fact to the page(s) that actually contain it, so
citation accuracy can be scored without a human or an LLM judge.
"""
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GoldenQuestion:
    id: str
    question: str
    doc_filename: str
    expected_pages: tuple[int, ...]
    note: str = ""


def load_golden_set(path: str | Path) -> list[GoldenQuestion]:
    """Load a golden set from JSON."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        GoldenQuestion(
            id=entry["id"],
            question=entry["question"],
            doc_filename=entry["doc_filename"],
            expected_pages=tuple(entry["expected_pages"]),
            note=entry.get("note", ""),
        )
        for entry in raw
    ]
