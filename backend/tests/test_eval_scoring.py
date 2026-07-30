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
