"""Golden-set loading and citation scoring. Pure functions — no API calls."""
import json

from evals.golden_set import GoldenQuestion, load_golden_set


def test_load_golden_set_parses_entries(tmp_path):
    path = tmp_path / "set.json"
    path.write_text(
        json.dumps([
            {
                "id": "fee-1",
                "question": "What is the management fee?",
                "doc_filename": "example_lpa.md",
                "expected_pages": [2],
                "note": "defined in section 3.2",
            }
        ]),
        encoding="utf-8",
    )

    questions = load_golden_set(path)

    assert len(questions) == 1
    assert questions[0] == GoldenQuestion(
        id="fee-1",
        question="What is the management fee?",
        doc_filename="example_lpa.md",
        expected_pages=(2,),
        note="defined in section 3.2",
    )


def test_load_golden_set_defaults_note_to_empty(tmp_path):
    path = tmp_path / "set.json"
    path.write_text(
        json.dumps([{
            "id": "q1",
            "question": "Q?",
            "doc_filename": "d.md",
            "expected_pages": [1, 3],
        }]),
        encoding="utf-8",
    )

    assert load_golden_set(path)[0].note == ""
    assert load_golden_set(path)[0].expected_pages == (1, 3)


def test_shipped_example_set_loads():
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "evals" / "data" / "example_golden_set.json"

    questions = load_golden_set(path)

    assert len(questions) == 3
    assert all(q.expected_pages for q in questions)


# Task 8: Citation accuracy scorer tests

from app.models.query import Citation
from evals.scoring import aggregate, score_question

GOLDEN = GoldenQuestion(
    id="q1",
    question="What is the fee?",
    doc_filename="example_lpa.md",
    expected_pages=(2, 3),
)


def _cite(page, source="example_lpa.md"):
    return Citation(source_file=source, page=page, text_snippet="...")


def test_hit_when_one_citation_is_on_an_expected_page():
    score = score_question(GOLDEN, [_cite(2)])

    assert score.hit is True
    assert score.had_citation is True
    assert score.precision == 1.0
    assert score.cited_pages == (2,)


def test_miss_when_all_citations_are_off_target():
    score = score_question(GOLDEN, [_cite(7), _cite(9)])

    assert score.hit is False
    assert score.had_citation is True
    assert score.precision == 0.0


def test_precision_penalizes_shotgun_citing():
    score = score_question(GOLDEN, [_cite(2), _cite(7), _cite(8), _cite(9)])

    assert score.hit is True
    assert score.precision == 0.25


def test_none_entries_are_ignored():
    """extract_citations pads unused [Source N] slots with None."""
    score = score_question(GOLDEN, [None, _cite(3), None])

    assert score.hit is True
    assert score.cited_pages == (3,)
    assert score.precision == 1.0


def test_no_citations_is_a_miss_not_a_crash():
    score = score_question(GOLDEN, [])

    assert score.hit is False
    assert score.had_citation is False
    assert score.precision == 0.0


def test_all_none_is_treated_as_no_citation():
    score = score_question(GOLDEN, [None, None])

    assert score.had_citation is False
    assert score.hit is False


def test_wrong_document_is_a_miss():
    score = score_question(GOLDEN, [_cite(2, source="other.pdf")])

    assert score.hit is False
    assert score.precision == 0.0


def test_aggregate_computes_rates():
    scores = [
        score_question(GOLDEN, [_cite(2)]),
        score_question(GOLDEN, [_cite(9)]),
        score_question(GOLDEN, []),
        score_question(GOLDEN, [_cite(3)]),
    ]

    report = aggregate(scores)

    assert report.hit_rate == 0.5
    assert report.no_citation_rate == 0.25
    assert report.mean_precision == 0.5
    assert len(report.scores) == 4


def test_aggregate_of_empty_is_zeroed():
    report = aggregate([])

    assert report.hit_rate == 0.0
    assert report.mean_precision == 0.0
    assert report.no_citation_rate == 0.0
