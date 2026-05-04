"""Column-format prompt enforcement + post-extraction parsing.

Adapted from Mike's `formatPromptSuffix()` (mike/backend/src/routes/tabular.ts:21)
but using Vyntic's existing `[Source N]` citation convention instead of Mike's
`[[page:N||quote:...]]` shape — keeps `extract_citations()` reusable as-is.

Two responsibilities:
  1. `format_prompt_suffix(format, tags)` — instructions appended to the LLM
     prompt so output is shape-constrained.
  2. `parse_answer(answer, format, tags)` — best-effort parse of the cleaned
     answer into a structured value (number, bool, list, etc.) for storage.
     Returns None on parse failure; the raw answer is always preserved.
"""
from __future__ import annotations

import re
from typing import Any


_BULLET_LINE_RE = re.compile(r"^\s*[-*•]\s+(.*\S)\s*$")
_NUMBER_RE = re.compile(r"-?\d{1,3}(?:[, ]\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?")
_PERCENT_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*%")
_CURRENCY_SYMBOL_TO_CODE = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
}
_CURRENCY_CODE_RE = re.compile(r"\b(USD|EUR|GBP|JPY|CAD|AUD|CNY|CHF|HKD|INR|SGD)\b")
_DATE_ISO_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_DATE_VERBOSE_RE = re.compile(
    r"\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b",
    re.IGNORECASE,
)


def format_prompt_suffix(fmt: str, tags: list[str] | None = None) -> str:
    """Return a one-paragraph instruction to append to the LLM prompt.

    Always preserves the existing Vyntic convention: cite supporting evidence
    inline as `[Source N]` referencing the numbered context blocks.
    """
    base_cite = (
        " Cite every claim inline using [Source N] where N is the source number "
        "from the context above."
    )

    if fmt == "yes_no":
        return (
            " Answer with a single word: 'Yes' or 'No'. If the document does "
            "not provide a clear answer, respond 'Not stated'." + base_cite
        )
    if fmt == "number":
        return (
            " Answer with a single number only — no units, no commas, no "
            "explanation (e.g. 1234 or 12.5). If the document gives a range, "
            "respond with the midpoint." + base_cite
        )
    if fmt == "percentage":
        return (
            " Answer with a single percentage value followed by '%' (e.g. 42% "
            "or 12.5%). No explanation." + base_cite
        )
    if fmt == "monetary_amount":
        return (
            " Answer with the monetary value only, including currency symbol "
            "or code and the period (e.g. $50.4M FY2023, €1.2B LTM). No "
            "additional explanation." + base_cite
        )
    if fmt == "currency":
        return (
            " Answer with the ISO currency code only (e.g. USD, EUR). If "
            "multiple, comma-separate them." + base_cite
        )
    if fmt == "date":
        return (
            " Answer with a single ISO date (YYYY-MM-DD). If only a year is "
            "stated, respond 'YYYY-01-01'. If a range, respond 'YYYY-MM-DD to "
            "YYYY-MM-DD'." + base_cite
        )
    if fmt == "bulleted_list":
        return (
            " Answer as a Markdown bulleted list, one item per line, each "
            "prefixed with '- '. No headings, no surrounding prose." + base_cite
        )
    if fmt == "tag":
        if tags:
            options = ", ".join(tags)
            return (
                f" Answer with exactly one of these labels: {options}. No "
                "other text." + base_cite
            )
        return base_cite
    # Default: text / bulleted_list (no tags) / unknown.
    return base_cite


# ── Parsing helpers ──


def _parse_number(answer: str) -> float | None:
    match = _NUMBER_RE.search(answer)
    if not match:
        return None
    raw = match.group(0).replace(",", "").replace(" ", "")
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_percent(answer: str) -> float | None:
    match = _PERCENT_RE.search(answer)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return _parse_number(answer)


_NOT_STATED_PREFIXES = (
    "not stated",
    "not disclosed",
    "not specified",
    "not provided",
    "not mentioned",
    "not addressed",
    "not available",
    "not found",
    "n/a",
    "unknown",
    "unclear",
    "no relevant",  # the executor's own "No relevant content found..." fallback
)


def _parse_yes_no(answer: str) -> bool | None:
    """Parse a yes/no answer.

    Treats 'Not stated', 'N/A', 'Unknown', etc. as None (rather than False).
    Uses word-boundary matching so 'No' as a substring of 'Not' doesn't
    trigger a False classification.
    """
    lowered = answer.strip().lower()
    if not lowered:
        return None
    # Catch 'Not stated' / 'Not disclosed' / 'N/A' / 'Unknown' first.
    for prefix in _NOT_STATED_PREFIXES:
        if lowered.startswith(prefix):
            return None
    # Word-boundary match: only match Yes/No as standalone first words.
    first_word = re.split(r"\W+", lowered, maxsplit=1)[0]
    if first_word == "yes":
        return True
    if first_word == "no":
        return False
    return None


def _parse_currency(answer: str) -> list[str]:
    found = []
    for raw in re.findall(r"[A-Z]{3}", answer):
        if raw in {"USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CNY", "CHF", "HKD", "INR", "SGD"}:
            if raw not in found:
                found.append(raw)
    if found:
        return found
    # Try symbols
    for sym, code in _CURRENCY_SYMBOL_TO_CODE.items():
        if sym in answer and code not in found:
            found.append(code)
    return found


def _parse_monetary(answer: str) -> dict | None:
    amount = _parse_number(answer)
    currencies = _parse_currency(answer)
    if amount is None and not currencies:
        return None
    return {
        "amount": amount,
        "currency": currencies[0] if currencies else None,
        "raw": answer.strip(),
    }


def _parse_date(answer: str) -> str | None:
    iso = _DATE_ISO_RE.search(answer)
    if iso:
        return iso.group(0)
    verbose = _DATE_VERBOSE_RE.search(answer)
    if verbose:
        day = int(verbose.group(1))
        month_name = verbose.group(2).lower()
        year = int(verbose.group(3))
        months = [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
        ]
        if month_name in months:
            month = months.index(month_name) + 1
            return f"{year:04d}-{month:02d}-{day:02d}"
    # Fallback: 4-digit year only
    year_match = re.search(r"\b(19|20)\d{2}\b", answer)
    if year_match:
        return f"{year_match.group(0)}-01-01"
    return None


def _parse_bulleted_list(answer: str) -> list[str]:
    items = []
    for line in answer.splitlines():
        match = _BULLET_LINE_RE.match(line)
        if match:
            items.append(match.group(1))
    if items:
        return items
    # Fallback: split on newlines if no bullets
    cleaned = [ln.strip() for ln in answer.splitlines() if ln.strip()]
    return cleaned


def _parse_tag(answer: str, tags: list[str] | None) -> str | None:
    if not tags:
        return answer.strip() or None
    lowered = answer.lower()
    for tag in tags:
        if tag.lower() in lowered:
            return tag
    return None


def parse_answer(answer: str, fmt: str, tags: list[str] | None = None) -> Any:
    """Best-effort structured parse of an LLM answer per column format.

    Returns None when parse fails — callers should always preserve the raw
    answer alongside this structured value.
    """
    if not answer:
        return None
    if fmt == "yes_no":
        return _parse_yes_no(answer)
    if fmt == "number":
        return _parse_number(answer)
    if fmt == "percentage":
        return _parse_percent(answer)
    if fmt == "monetary_amount":
        return _parse_monetary(answer)
    if fmt == "currency":
        return _parse_currency(answer)
    if fmt == "date":
        return _parse_date(answer)
    if fmt == "bulleted_list":
        return _parse_bulleted_list(answer)
    if fmt == "tag":
        return _parse_tag(answer, tags)
    return None
