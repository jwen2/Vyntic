"""LLM extraction for the monitoring wedge — capital-call/distribution notices
and side-letter obligations + per-period compliance checks.

Everything routes through the single extraction primitive
(`extraction_engine.run_extraction`); this module only builds prompts and parses
the structured text back into typed records."""
import logging
import re

from app.agents.llm import llm_call_context
from app.database import SessionLocal, DocumentRow
from app.services import context_provider
from app.services.extraction_engine import run_extraction
from app.models.monitoring import (
    CallNoticeDraft,
    ObligationDraft,
    OBLIGATION_CATEGORIES,
    VERDICTS,
)

logger = logging.getLogger(__name__)


# ── field-block parsing (tolerant; "Not found" → None) ──

def _parse_fields(text: str) -> dict[str, str]:
    """Parse `Label: value` lines into a lowercased dict."""
    fields: dict[str, str] = {}
    for line in (text or "").splitlines():
        m = re.match(r"\s*([A-Za-z /&]+?)\s*:\s*(.*)$", line)
        if m:
            fields[m.group(1).strip().lower()] = m.group(2).strip()
    return fields


def _num(value: str | None) -> float | None:
    if not value:
        return None
    if value.strip().lower() in ("not found", "n/a", "none", "-", ""):
        return None
    cleaned = re.sub(r"[,$€£%\s]", "", value)
    m = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    return float(m.group()) if m else None


def _text(value: str | None) -> str:
    if not value or value.strip().lower() == "not found":
        return ""
    return value.strip()


# ── capital-call / distribution notice ──

_CALL_PROMPT = (
    "You are an LP operations analyst processing a CAPITAL-CALL or DISTRIBUTION "
    "NOTICE from a private fund. Extract the following fields, ONE PER LINE, using "
    "exactly these labels. Write \"Not found\" when the notice does not support a "
    "field. Include [Source N] citations for the amount and due date.\n"
    "Kind: [call or distribution]\n"
    "Amount: [total amount requested or distributed]\n"
    "Currency: [USD/EUR/GBP/...]\n"
    "Due date: [ISO date YYYY-MM-DD the wire is due, or the distribution pay/record date]\n"
    "Period: [reporting period like 2026-Q3 if stated]\n"
    "Purpose: [one sentence: what the call funds, or what the distribution represents "
    "— return of capital vs. gain]\n"
    "Outstanding: [remaining unfunded commitment after this call, if stated]"
)


async def extract_call_notice(deal_id: str, doc_id: str) -> CallNoticeDraft:
    with llm_call_context(surface="monitoring", deal_id=deal_id, doc_id=doc_id):
        chunks = await context_provider.load_doc_context(deal_id, doc_id, _CALL_PROMPT)
        result = await run_extraction(
            chunks,
            _CALL_PROMPT,
            deal_id=deal_id,
            require_citations=False,  # not every notice cites cleanly; keep what we get
        )
        fields = _parse_fields(result.answer)
        kind_raw = _text(fields.get("kind")).lower()
        kind = "distribution" if "distrib" in kind_raw else "call"
        return CallNoticeDraft(
            kind=kind,
            amount=_num(fields.get("amount")),
            currency=(_text(fields.get("currency")) or "USD").upper()[:3] or "USD",
            due_date=_text(fields.get("due date")) or None,
            period=_text(fields.get("period")) or None,
            purpose=_text(fields.get("purpose")),
            outstanding_before=_num(fields.get("outstanding")),
            doc_id=doc_id,
            citations=result.citations,
        )


# ── side-letter obligations ──

_OBLIGATION_PROMPT = (
    "You are an LP legal analyst reading a SIDE LETTER — a per-investor agreement "
    "granting this LP special terms. Extract EVERY distinct obligation or right the "
    "GP owes this LP. Number them. For each, use exactly this block, one field per "
    "line, then a blank line before the next:\n"
    "Obligation: [one sentence — the promise, right, or protection]\n"
    "Category: [one of: fee, mfn, coinvest, reporting, transfer, excuse, regulatory, other]\n"
    "Section: [clause/section reference if present, else Not found]\n"
    "Cadence: [ongoing or one_time]\n"
    "VerifyHint: [what an LP should check each quarter to confirm this is being honored]\n"
    "Include [Source N] citations. If the document is not a side letter or contains no "
    "obligations, return nothing."
)

_BLOCK_SPLIT = re.compile(r"\n\s*\n")


async def extract_obligations(deal_id: str, doc_id: str) -> list[ObligationDraft]:
    with llm_call_context(surface="monitoring", deal_id=deal_id, doc_id=doc_id):
        chunks = await context_provider.load_doc_context(deal_id, doc_id, _OBLIGATION_PROMPT)
        result = await run_extraction(chunks, _OBLIGATION_PROMPT, deal_id=deal_id)
        drafts: list[ObligationDraft] = []
        for block in _BLOCK_SPLIT.split(result.answer or ""):
            fields = _parse_fields(block)
            text = _text(fields.get("obligation"))
            if not text:
                continue
            category = _text(fields.get("category")).lower()
            if category not in OBLIGATION_CATEGORIES:
                category = "other"
            cadence = "one_time" if "one" in _text(fields.get("cadence")).lower() else "ongoing"
            drafts.append(ObligationDraft(
                category=category,
                text=text,
                section_ref=_text(fields.get("section")),
                cadence=cadence,
                verify_hint=_text(fields.get("verifyhint")),
                citations=result.citations,  # block-level citation attribution is coarse; acceptable v1
            ))
        return drafts


# ── per-period verification of one obligation ──

_PERIOD_DOC_CATEGORIES = ("quarterly_report", "capital_account", "financial_statements")


def _period_doc_ids(deal_id: str, period: str) -> list[str]:
    db = SessionLocal()
    try:
        rows = (
            db.query(DocumentRow.doc_id)
            .filter(
                DocumentRow.deal_id == deal_id,
                DocumentRow.period == period,
                DocumentRow.doc_category.in_(_PERIOD_DOC_CATEGORIES),
            )
            .all()
        )
        return [r[0] for r in rows]
    finally:
        db.close()


async def verify_obligation(deal_id: str, period: str, obligation_text: str, verify_hint: str) -> dict:
    """Propose a verdict for one obligation against a period's reporting package.
    Returns {verdict, rationale, citations}. Returns 'unclear' with an explicit
    note when no reporting docs exist for the period (not an error)."""
    doc_ids = _period_doc_ids(deal_id, period)
    if not doc_ids:
        return {
            "verdict": "unclear",
            "rationale": f"No reporting documents classified for {period} to verify against.",
            "citations": [],
        }

    with llm_call_context(surface="monitoring", deal_id=deal_id):
        chunks: list[dict] = []
        question = (
            f"Obligation owed to this LP: \"{obligation_text}\". "
            f"What to check: {verify_hint or 'whether the GP honored this obligation'}."
        )
        for doc_id in doc_ids:
            chunks.extend(await context_provider.load_doc_context(deal_id, doc_id, question))

        prompt = (
            "You are an LP compliance analyst verifying whether a side-letter obligation "
            "was honored in a fund's quarterly reporting package.\n\n"
            f"Obligation: {obligation_text}\n"
            f"What to check each quarter: {verify_hint or '(use judgment)'}\n\n"
            "Answer in exactly this format:\n"
            "Verdict: [compliant, breach, or unclear]\n"
            "Rationale: [one to two sentences citing the specific evidence in the reporting "
            "package, with [Source N] citations. Say 'unclear' when the package does not "
            "contain enough to judge.]"
        )
        result = await run_extraction(chunks, prompt, deal_id=deal_id)
        fields = _parse_fields(result.answer)
        verdict = _text(fields.get("verdict")).lower()
        verdict = next((v for v in VERDICTS if v in verdict), "unclear")
        rationale = _text(fields.get("rationale")) or (result.answer or "").strip()
        return {"verdict": verdict, "rationale": rationale, "citations": result.citations}
