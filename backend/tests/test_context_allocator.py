from app.services.context_allocator import (
    ContextSelection, DocCandidate, allocate, RELEVANCE_FLOOR,
)


def _doc(doc_id, size, category="other", pages=1):
    """size_chars drives allocation; chunks carry proportional content."""
    whole = [{"content": "x" * size, "source_file": f"{doc_id}.pdf",
              "page": 1, "doc_id": doc_id, "score": 1.0, "section_type": "text"}]
    page = [{"content": "x" * (size // 4), "source_file": f"{doc_id}.pdf",
             "page": 1, "doc_id": doc_id, "score": 0.5, "section_type": "text"}]
    return DocCandidate(doc_id=doc_id, filename=f"{doc_id}.pdf", category=category,
                        size_chars=size, whole_chunks=whole, page_chunks=page)


def test_under_budget_sends_everything_whole_and_never_probes():
    docs = [_doc("a", 400), _doc("b", 400)]
    sel = allocate(docs, budget=10_000, scores=None)
    assert sel.strategy == "full_text"
    assert sel.whole_docs == ["a", "b"]
    assert sel.partial_docs == []
    assert sel.excluded_docs == []


def test_over_budget_demotes_lowest_ranked_to_pages():
    # budget 250 tokens = 1000 chars. a(800) whole, b(800) cannot fit whole.
    docs = [_doc("a", 800), _doc("b", 800)]
    sel = allocate(docs, budget=250, scores={"a": 0.9, "b": 0.2})
    assert sel.strategy == "allocated"
    assert sel.whole_docs == ["a"]
    assert sel.partial_docs == ["b"]


def test_below_floor_is_excluded_and_named():
    docs = [_doc("a", 800), _doc("junk", 800)]
    sel = allocate(docs, budget=250, scores={"a": 0.9, "junk": RELEVANCE_FLOOR / 2})
    assert sel.excluded_docs == ["junk"]
    assert all(c["doc_id"] != "junk" for c in sel.chunks)


def test_category_floor_prevents_exclusion_of_governing_documents():
    docs = [_doc("a", 800), _doc("thelpa", 800, category="lpa")]
    sel = allocate(docs, budget=250, scores={"a": 0.9, "thelpa": RELEVANCE_FLOOR / 2})
    assert "thelpa" not in sel.excluded_docs
    assert "thelpa" in sel.partial_docs


def test_rank_one_always_enters_whole_even_if_oversized():
    # single doc larger than the whole budget still goes in whole
    docs = [_doc("huge", 100_000)]
    sel = allocate(docs, budget=250, scores={"huge": 0.9})
    assert sel.whole_docs == ["huge"]


def test_unscored_documents_are_never_excluded_on_absence():
    # "b" is absent from probe results entirely — must not be treated as 0
    docs = [_doc("a", 800), _doc("b", 800)]
    sel = allocate(docs, budget=250, scores={"a": 0.9})
    assert sel.excluded_docs == []
    assert "b" in sel.partial_docs


def test_probe_failure_excludes_nothing():
    docs = [_doc("a", 800), _doc("b", 800)]
    sel = allocate(docs, budget=250, scores=None)
    assert sel.excluded_docs == []


def test_probe_unavailable_and_over_budget_still_caps_to_budget():
    """The empty-Chroma regression: probe unavailable (scores=None), so
    nothing can be excluded by relevance score — the final size cap must
    still fire and bring the real, joined content within budget, and must
    name whatever it dropped."""
    docs = [_doc("a", 800), _doc("b", 800), _doc("c", 800)]
    sel = allocate(docs, budget=250, scores=None)

    sent_tokens = sum(len(c["content"]) for c in sel.chunks) // 4
    assert sent_tokens <= 250
    assert len(sel.chunks) >= 1
    # Something was dropped, and it's named — not silently absorbed.
    assert sel.excluded_docs or sel.partial_docs != ["a", "b", "c"]
    assert sel.excluded_docs == ["c"]
    assert all(c["doc_id"] != "c" for c in sel.chunks)


def test_cap_demotes_whole_doc_that_partially_overflows():
    """A doc that entered 'whole' with multiple chunks, but whose real
    content overflows budget, loses only the chunks that don't fit — and
    the bookkeeping must reflect that it's now partial, not whole."""
    whole = [
        {"content": "x" * 400, "source_file": "a.pdf", "page": 1,
         "doc_id": "a", "score": 1.0, "section_type": "text"},
        {"content": "x" * 400, "source_file": "a.pdf", "page": 2,
         "doc_id": "a", "score": 1.0, "section_type": "text"},
    ]
    doc_a = DocCandidate(doc_id="a", filename="a.pdf", category="other",
                          size_chars=800, whole_chunks=whole, page_chunks=whole)

    sel = allocate([doc_a], budget=50, scores=None)

    assert sel.whole_docs == []
    assert sel.partial_docs == ["a"]
    assert sel.excluded_docs == []
    assert [c["page"] for c in sel.chunks] == [1]
