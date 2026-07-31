"""End-to-end allocation over the real seeded Brightwater documents.

The over-budget case uses an artificially small budget: no corpus in the dev
database can reach the real one (the largest deal is ~1.4M chars against a
~1M-token window), so the only way to exercise the wall is to move it.

Both tests keep the provider metadata call off the network by making
_fetch_input_limit fail, which is the documented fallback path — the budget
then derives from settings.context_window_tokens through the real code.
"""
import pytest

from app.services import context_budget, context_provider


@pytest.fixture(autouse=True)
def offline_window(monkeypatch):
    """No network in the suite: fall back to the configured window."""
    def unavailable(model_name):
        raise RuntimeError("provider metadata unavailable in tests")

    monkeypatch.setattr(context_budget, "_fetch_input_limit", unavailable)
    context_budget.resolve_window.cache_clear()
    yield
    context_budget.resolve_window.cache_clear()


async def test_brightwater_allocates_under_a_small_budget(client, monkeypatch,
                                                          seeded_brightwater):
    monkeypatch.setattr(context_budget, "budget_tokens", lambda *a, **k: 2_000)

    sel = await context_provider.load_deal_selection(
        "brightwater_iv", "what is the management fee and fee offset?"
    )

    assert sel.strategy == "allocated"
    # Something was demoted or excluded — the budget is far below the corpus.
    assert sel.partial_docs or sel.excluded_docs
    # The LPA is category-floored: it may be demoted, never excluded.
    assert [d for d in sel.excluded_docs if "lpa" in d] == []
    # Whatever survived is real context, not an empty selection.
    assert sel.chunks


async def test_every_existing_deal_still_allocates_whole(client, seeded_brightwater):
    """Regression: below budget, behavior is unchanged from before the allocator."""
    for deal_id in seeded_brightwater:
        sel = await context_provider.load_deal_selection(deal_id, "summarize")
        assert sel.strategy == "full_text", deal_id
        assert sel.excluded_docs == [], deal_id
        assert sel.partial_docs == [], deal_id


async def test_manager_scoped_documents_reach_the_sibling_fund(client,
                                                               seeded_brightwater):
    """Invariant 2's one deliberate relaxation survives allocation.

    Fund IV owns the Form ADV and valuation policy at manager scope; Fund III
    must see them through _manager_shared_doc_rows.
    """
    sel = await context_provider.load_deal_selection(
        "brightwater_iii", "what does the Form ADV disclose about fees?"
    )
    included = set(sel.whole_docs) | set(sel.partial_docs)
    assert "brightwater_adv_part2a" in included
    # Fund IV's entity-scoped LPA must not come with it.
    assert "brightwater_iv_lpa" not in included
