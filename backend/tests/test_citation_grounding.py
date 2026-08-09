"""Grounding-preservation rules for the citation pipeline.

These guard the interaction between the cosmetic citation strippers in
`utils/citations.py` and the `require_citations` blanking rule in
`extraction_engine.py`. The strippers exist to tidy where citations *appear*;
they must never be able to remove the last citation from an answer and thereby
cause a fully-grounded answer to be discarded as ungrounded.

Regression origin: workflow grid cells rendered blank because the model
answered with a markdown table (as prompted), every [Source N] lived inside a
table cell, `_strip_table_cell_citations` removed them all, and the engine then
threw the answer away.
"""
from app.utils.citations import (
    extract_citations,
    is_absent_finding_only,
    should_blank_ungrounded,
)

CHUNKS = [
    {
        "source_file": "glenmoor_fund_iii_side_letter.pdf",
        "page": 1,
        "content": "Most Favored Nations. The Investor may elect within 30 days after final close.",
    },
    {
        "source_file": "glenmoor_fund_iii_side_letter.pdf",
        "page": 2,
        "content": "Reporting. Quarterly reports within 45 days after quarter-end.",
    },
]


def _citations_for(answer: str) -> list:
    _, cits = extract_citations(answer, CHUNKS, deal_id="brightwater_iii")
    return [c for c in cits if c is not None]


# ── Defect C: table-only answers must keep their grounding ──


def test_table_only_answer_retains_citations():
    """Every citation inside table cells is the answer's only grounding.

    Stripping them all would leave a fully-sourced answer looking ungrounded.
    """
    answer = (
        "| Obligation | Timing |\n"
        "| :--- | :--- |\n"
        "| MFN Election | 30 days after final close [Source 1] |\n"
        "| Quarterly Reports | Within 45 days [Source 2] |\n"
    )
    assert len(_citations_for(answer)) == 2


def test_table_cell_citations_still_stripped_when_prose_carries_them():
    """The cosmetic rule still applies when it costs no grounding."""
    answer = (
        "The side letter sets two deadlines [Source 1].\n\n"
        "| Obligation | Timing |\n"
        "| :--- | :--- |\n"
        "| MFN Election | 30 days [Source 1] |\n"
        "| Quarterly Reports | 45 days [Source 2] |\n"
    )
    cleaned, _ = extract_citations(answer, CHUNKS, deal_id="brightwater_iii")
    table_lines = [l for l in cleaned.splitlines() if l.lstrip().startswith("|")]
    assert not any("[Source" in l for l in table_lines)


# ── Defect A: the absent-finding strip must be sentence-scoped ──


def test_absent_clause_does_not_strip_sibling_claims_on_same_line():
    """A trailing 'not disclosed' clause must not unground the whole paragraph.

    LLM prose is paragraph-shaped: one line holds many sentences.
    """
    answer = (
        "The MFN election runs 30 days after final close [Source 1]. "
        "Quarterly reports are due within 45 days [Source 2]. "
        "The replacement period is not disclosed."
    )
    assert len(_citations_for(answer)) == 2


def test_absent_finding_sentence_still_loses_its_own_citation():
    """The rule itself is preserved: a negative claim may not cite."""
    answer = "The replacement period is not disclosed [Source 1]."
    assert _citations_for(answer) == []


def test_citation_trailing_after_the_final_period_belongs_to_that_sentence():
    """A citation placed after the closing period is not its own sentence.

    Sentence splitting on [.!?] would otherwise leave "[Source 1]" standing
    alone, free of the negative clause it actually supports, and keep it.
    """
    answer = "Not found. The LPA does not disclose a fiduciary-duty modification. [Source 1]"
    assert _citations_for(answer) == []


# ── Defect B: an honest negative must survive the blanking rule ──


def test_purely_negative_answer_is_not_blanked():
    assert is_absent_finding_only("Not found.") is True
    assert should_blank_ungrounded("Not found.", []) is False


def test_ungrounded_affirmative_answer_is_still_blanked():
    """Invariant 6 holds: an affirmative claim with no citation is discarded."""
    answer = "The management fee is 2.0% of committed capital."
    assert is_absent_finding_only(answer) is False
    assert should_blank_ungrounded(answer, []) is True


def test_answer_with_a_citation_is_never_blanked():
    cits = _citations_for("The MFN election runs 30 days [Source 1].")
    assert should_blank_ungrounded("The MFN election runs 30 days [Source 1].", cits) is False


def test_mixed_answer_mentioning_absent_info_is_still_blanked_when_ungrounded():
    """'Purely negative' means every sentence is negative, not merely one."""
    answer = (
        "The management fee is 2.0% of committed capital. "
        "The offset percentage is not disclosed."
    )
    assert is_absent_finding_only(answer) is False
    assert should_blank_ungrounded(answer, []) is True
