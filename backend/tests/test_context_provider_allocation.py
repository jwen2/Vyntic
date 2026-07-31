import pytest
from app.services import context_provider


@pytest.mark.asyncio
async def test_small_deal_returns_every_document_whole(client, seeded_small_deal):
    """Below budget: identical to pre-allocator behavior."""
    sel = await context_provider.load_deal_selection(
        seeded_small_deal, "what is the management fee?"
    )
    assert sel.strategy == "full_text"
    assert sel.excluded_docs == []
    assert sel.partial_docs == []


@pytest.mark.asyncio
async def test_load_deal_context_still_returns_a_chunk_list(client, seeded_small_deal):
    chunks = await context_provider.load_deal_context(seeded_small_deal, "fee?")
    assert isinstance(chunks, list)
    assert all("content" in c and "page" in c for c in chunks)
