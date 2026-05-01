"""
Tools exposed to the Diligence Agent. Each tool is a thin async callable
closed over `deal_id` at construction so cross-deal access is structurally
impossible. `search_document` and `read_pages` additionally assert that
`doc_id` belongs to `deal_id` before returning anything.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.services import deal_store
from app.services.vector_store import (
    get_document_chunks,
    query_deal,
    query_document,
)


DEFAULT_SEARCH_K = 12
MAX_K = 20
MAX_READ_PAGES = 10


@dataclass
class AgentState:
    """Mutable state shared between the planner loop and the tools."""
    deal_id: str
    deal_name: str
    goal: str
    findings: list[dict] = field(default_factory=list)
    evidence: list[dict] = field(default_factory=list)  # accumulated tool results
    memo: str = ""
    done: bool = False
    iterations: int = 0


@dataclass
class ToolResult:
    """Structured tool result. `summary` is the single line streamed to the
    client; `payload` is the full content that goes back to the planner."""
    summary: str
    payload: Any
    emit_event: dict | None = None  # optional extra SSE event (e.g. finding)


ToolFn = Callable[..., Awaitable[ToolResult]]


def _clip_snippet(text: str, n: int = 240) -> str:
    lines = [" ".join(line.split()) for line in (text or "").strip().splitlines()]
    text = "\n".join(line for line in lines if line)
    if len(text) <= n:
        return text
    return text[: n - 1] + "…"


def make_tools(state: AgentState) -> dict[str, ToolFn]:
    """Return the tool registry bound to a single deal's state."""
    deal_id = state.deal_id

    def _assert_doc_in_deal(doc_id: str) -> bool:
        for d in deal_store.list_documents(deal_id):
            if d.doc_id == doc_id:
                return True
        return False

    # ── search_deal ──
    async def search_deal(query: str, k: int = DEFAULT_SEARCH_K) -> ToolResult:
        k = max(1, min(int(k or DEFAULT_SEARCH_K), MAX_K))
        hits = await query_deal(deal_id, query, top_k=k)
        trimmed = [
            {
                "chunk": _clip_snippet(h["content"], 400),
                "source_file": h["source_file"],
                "page": h["page"],
                "score": round(float(h.get("score", 0.0)), 3),
            }
            for h in hits
        ]
        state.evidence.extend(trimmed)
        files = sorted({h["source_file"] for h in trimmed})
        summary = f"search_deal: {len(trimmed)} chunks across {len(files)} doc(s)"
        return ToolResult(summary=summary, payload=trimmed)

    # ── search_document ──
    async def search_document(doc_id: str, query: str, k: int = DEFAULT_SEARCH_K) -> ToolResult:
        if not _assert_doc_in_deal(doc_id):
            return ToolResult(
                summary=f"search_document: doc_id '{doc_id}' not in this deal",
                payload={"error": "doc_not_in_deal"},
            )
        k = max(1, min(int(k or DEFAULT_SEARCH_K), MAX_K))
        hits = await query_document(deal_id, doc_id, query, top_k=k)
        trimmed = [
            {
                "chunk": _clip_snippet(h["content"], 400),
                "source_file": h["source_file"],
                "page": h["page"],
                "score": round(float(h.get("score", 0.0)), 3),
            }
            for h in hits
        ]
        state.evidence.extend(trimmed)
        summary = f"search_document({doc_id}): {len(trimmed)} chunks"
        return ToolResult(summary=summary, payload=trimmed)

    # ── list_documents ──
    async def list_documents() -> ToolResult:
        docs = deal_store.list_documents(deal_id)
        payload = [
            {
                "doc_id": d.doc_id,
                "filename": d.filename,
                "page_count": d.page_count,
            }
            for d in docs
        ]
        summary = f"list_documents: {len(payload)} document(s)"
        return ToolResult(summary=summary, payload=payload)

    # ── read_pages ──
    async def read_pages(doc_id: str, page_start: int, page_end: int) -> ToolResult:
        if not _assert_doc_in_deal(doc_id):
            return ToolResult(
                summary=f"read_pages: doc_id '{doc_id}' not in this deal",
                payload={"error": "doc_not_in_deal"},
            )
        try:
            ps = int(page_start)
            pe = int(page_end)
        except (TypeError, ValueError):
            return ToolResult(
                summary="read_pages: invalid page numbers",
                payload={"error": "invalid_pages"},
            )
        if pe < ps:
            pe = ps
        # Clamp range to MAX_READ_PAGES
        pe = min(pe, ps + MAX_READ_PAGES - 1)

        chunks = get_document_chunks(deal_id, doc_id)
        pages: dict[int, list[str]] = {}
        source_file = ""
        for c in chunks:
            if ps <= c["page"] <= pe:
                pages.setdefault(c["page"], []).append(c["content"])
                source_file = source_file or c["source_file"]
        payload = [
            {
                "page": p,
                "text": _clip_snippet("\n".join(pages[p]), 1500),
            }
            for p in sorted(pages.keys())
        ]
        # Also push into evidence so memo writer can reference
        for item in payload:
            state.evidence.append({
                "chunk": item["text"],
                "source_file": source_file,
                "page": item["page"],
                "score": 1.0,
            })
        summary = f"read_pages({doc_id}, {ps}-{pe}): {len(payload)} page(s)"
        return ToolResult(summary=summary, payload=payload)

    # ── flag_finding ──
    async def flag_finding(
        category: str,
        claim: str,
        severity: str = "info",
        citations: list[dict] | None = None,
    ) -> ToolResult:
        sev = severity if severity in ("info", "watch", "red_flag") else "info"
        cites: list[dict] = []
        for c in (citations or []):
            if not isinstance(c, dict):
                continue
            cites.append({
                "source_file": str(c.get("source_file", ""))[:200],
                "page": int(c.get("page", 0) or 0),
                "snippet": _clip_snippet(str(c.get("snippet", "")), 300),
            })
        finding = {
            "category": str(category)[:120],
            "claim": str(claim)[:600],
            "severity": sev,
            "citations": cites,
        }
        state.findings.append(finding)
        summary = f"flag_finding[{sev}]: {finding['category']} — {_clip_snippet(finding['claim'], 80)}"
        return ToolResult(
            summary=summary,
            payload={"ok": True},
            emit_event={"type": "finding", **finding},
        )

    # ── finish ──
    async def finish(**_: Any) -> ToolResult:
        # We intentionally ignore any memo_markdown arg; the memo is written
        # by the finalizer using DILIGENCE_MEMO_SYSTEM for a properly streamed
        # output.
        state.done = True
        return ToolResult(summary="finish: wrapping up", payload={"ok": True})

    return {
        "search_deal": search_deal,
        "search_document": search_document,
        "list_documents": list_documents,
        "read_pages": read_pages,
        "flag_finding": flag_finding,
        "finish": finish,
    }
