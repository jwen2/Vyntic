"""
Manual end-to-end smoke test for the rewritten sweep endpoint logic.

Bypasses HTTP — exercises the actual functions to confirm:
  1. Streaming structured-output works with the configured model
  2. AnswersArrayStreamer fires per-question callbacks during the stream
  3. extract_citations + the SSE event payload look right
  4. All 11 scan areas are emitted in one batched call

Run: ./venv/bin/python tests/manual_sweep_e2e.py
"""
import asyncio
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Match the 11 frontend scan areas (close enough for a smoke test)
QUESTIONS = [
    "Deal snapshot",
    "Proposed transaction",
    "Key financial highlights",
    "Investment thesis",
    "Analyst next actions",
    "Hidden financial risks",
    "Buried contractual & legal risks",
    "Operational vulnerabilities",
    "Data room gaps & omissions",
    "Cross-document inconsistencies",
    "Regulatory & compliance exposure",
]

SYNTHETIC_CHUNKS = [
    {"content": "Acme Corp Q3 2025 financials: revenue $42M (-12% YoY), EBITDA margin 8% (down from 19%). Customer concentration: top 3 = 71% of revenue. CFO resigned Q2.",
     "source_file": "10K_2025.pdf", "page": 1, "section_type": "text"},
    {"content": "Working capital deteriorated $8M in 6 months. AR days went 45 -> 87.",
     "source_file": "10K_2025.pdf", "page": 14, "section_type": "text"},
    {"content": "MSA with TopCustomer Inc has change-of-control clause requiring written consent. Termination for convenience on 30 days notice.",
     "source_file": "msa.pdf", "page": 3, "section_type": "text"},
    {"content": "Pending lawsuit: ex-CTO seeking $3.5M for IP claims, trial date 2026-08.",
     "source_file": "litigation.pdf", "page": 2, "section_type": "text"},
    {"content": "Data room missing: 2024 audited financials, complete cap table, employment agreements for 4 of 7 executives.",
     "source_file": "diligence_log.pdf", "page": 1, "section_type": "text"},
    {"content": "Management projections show 35% revenue growth FY26, but pipeline coverage only 1.2x quota.",
     "source_file": "model.pdf", "page": 22, "section_type": "text"},
    {"content": "EU GDPR exposure: customer data transferred to US without SCCs since Schrems II.",
     "source_file": "compliance_memo.pdf", "page": 4, "section_type": "text"},
    {"content": "17 software licenses non-transferable; assignment requires vendor consent (60-90 days).",
     "source_file": "ip_schedule.pdf", "page": 1, "section_type": "text"},
    {"content": "Inventory write-down $2.1M Q3 not reflected in management adjusted EBITDA.",
     "source_file": "qoe.pdf", "page": 8, "section_type": "text"},
    {"content": "Two key engineers have non-competes that may not be enforceable in CA; retention risk.",
     "source_file": "hr_memo.pdf", "page": 1, "section_type": "text"},
    {"content": "$4M deferred tax asset, full valuation allowance not booked despite 3 years of losses.",
     "source_file": "tax_memo.pdf", "page": 2, "section_type": "text"},
    {"content": "Office lease expires 2026-04; landlord indicated 22% rent increase on renewal.",
     "source_file": "real_estate.pdf", "page": 1, "section_type": "text"},
    {"content": "Cyber insurance has $250K deductible and excludes ransomware after Q1 2026.",
     "source_file": "insurance.pdf", "page": 5, "section_type": "text"},
    {"content": "Customer churn: 3 of top 10 customers issued non-renewal notices in last 60 days.",
     "source_file": "customer_review.pdf", "page": 1, "section_type": "text"},
    {"content": "401(k) plan has uncorrected ERISA compliance issue from 2023 audit; potential DOL exposure.",
     "source_file": "benefits_audit.pdf", "page": 1, "section_type": "text"},
]


async def main():
    from langchain_core.messages import HumanMessage, SystemMessage
    from app.agents.prompts import PROACTIVE_SWEEP_BATCH_SYSTEM
    from app.api.routes_sweep import _get_sweep_llm, _backstop_parse
    from app.config import settings
    from app.utils.citations import build_context_string, extract_citations
    from app.utils.streaming_json import AnswersArrayStreamer

    qmap = {f"q{i}": q for i, q in enumerate(QUESTIONS)}
    context_str = build_context_string(SYNTHETIC_CHUNKS)
    system_prompt = PROACTIVE_SWEEP_BATCH_SYSTEM.format(context=context_str)
    user_payload = json.dumps({"scan_areas": [{"id": qid, "text": q} for qid, q in qmap.items()]})

    emitted_order: list[str] = []
    final_events: list[dict] = []

    def on_answer(obj):
        qid = obj.get("id")
        if qid not in qmap or qid in emitted_order:
            return
        emitted_order.append(qid)
        cleaned, citations = extract_citations(obj.get("answer", ""), SYNTHETIC_CHUNKS, deal_id="smoke")
        n_cites = sum(1 for c in citations if c is not None)
        elapsed = time.monotonic() - t0
        print(f"  [{elapsed:5.1f}s] {qid:>3} -> {qmap[qid]:42} ({len(cleaned):4} chars, {n_cites} cites)")
        final_events.append({"qid": qid, "answer": cleaned, "n_cites": n_cites, "elapsed": elapsed})

    streamer = AnswersArrayStreamer(on_answer)

    print(f"Model: {settings.gemini_model}")
    print(f"Sending {len(SYNTHETIC_CHUNKS)} chunks, {len(QUESTIONS)} scan areas, in ONE batched call.\n")

    t0 = time.monotonic()
    llm = _get_sweep_llm(settings.gemini_model)
    buf = ""
    chunks_received = 0
    first_token_at = None
    async for chunk in llm.astream([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_payload),
    ]):
        if chunk.content:
            if first_token_at is None:
                first_token_at = time.monotonic() - t0
            buf += chunk.content
            chunks_received += 1
            streamer.feed(chunk.content)
    total = time.monotonic() - t0

    # Backstop reparse
    _backstop_parse(buf, on_answer)

    print(f"\nTotal: {total:.1f}s, first token at {first_token_at:.1f}s, {chunks_received} stream chunks, {len(buf):,} chars")
    print(f"Answers emitted: {len(emitted_order)}/11")

    missing = [qid for qid in qmap if qid not in emitted_order]
    if missing:
        print(f"!! Missing scan areas: {missing}")
    else:
        print("All 11 scan areas covered.")

    # Sanity-check first answer
    if final_events:
        first = final_events[0]
        a = first["answer"]
        has_severity = any(t in a for t in ["[DEAL-BREAKER]", "[MATERIAL]", "[NOTEWORTHY]"])
        has_cite = "[Source" in a
        print(f"\nFirst answer ({first['qid']}): severity={has_severity}, citations={has_cite}")
        print(f"  preview: {a[:240]}...")


if __name__ == "__main__":
    asyncio.run(main())
