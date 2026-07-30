"""Citation accuracy scoring.

Fully automatable: a golden question names the page(s) that contain the
fact, so correctness of the *citation* needs no human and no LLM judge.
This is the product's core promise (CLAUDE.md invariant 6) as a number.
"""
from dataclasses import dataclass

from app.models.query import Citation
from evals.golden_set import GoldenQuestion


@dataclass(frozen=True)
class QuestionScore:
    id: str
    hit: bool
    had_citation: bool
    cited_pages: tuple[int, ...]
    expected_pages: tuple[int, ...]
    precision: float


@dataclass(frozen=True)
class EvalReport:
    hit_rate: float
    mean_precision: float
    no_citation_rate: float
    scores: tuple[QuestionScore, ...]


def score_question(
    golden: GoldenQuestion, citations: list[Citation | None]
) -> QuestionScore:
    """Score one answer's citations against the golden pages.

    hit       — at least one citation lands on an expected page
    precision — fraction of citations that are on expected pages; without
                it, citing every page would score a perfect hit rate
    """
    real = [c for c in citations if c is not None]
    on_target = [
        c
        for c in real
        if c.source_file == golden.doc_filename and c.page in golden.expected_pages
    ]

    return QuestionScore(
        id=golden.id,
        hit=len(on_target) > 0,
        had_citation=len(real) > 0,
        cited_pages=tuple(c.page for c in real),
        expected_pages=golden.expected_pages,
        precision=(len(on_target) / len(real)) if real else 0.0,
    )


def aggregate(scores: list[QuestionScore]) -> EvalReport:
    """Roll individual scores into headline rates."""
    if not scores:
        return EvalReport(
            hit_rate=0.0, mean_precision=0.0, no_citation_rate=0.0, scores=()
        )

    n = len(scores)
    return EvalReport(
        hit_rate=sum(1 for s in scores if s.hit) / n,
        mean_precision=sum(s.precision for s in scores) / n,
        no_citation_rate=sum(1 for s in scores if not s.had_citation) / n,
        scores=tuple(scores),
    )
