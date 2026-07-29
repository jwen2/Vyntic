"""Column-format prompt enforcement + post-extraction parsing.

Adapted from Mike's `formatPromptSuffix()` (mike/backend/src/routes/tabular.ts:21)
but using Vyntic's existing `[Source N]` citation convention instead of Mike's
`[[page:N||quote:...]]` shape — keeps `extract_citations()` reusable as-is.

Two responsibilities:
  1. `format_prompt_suffix(format, tags)` — instructions appended to the LLM
     prompt so output is shape-constrained.
  2. `parse_answer(answer, format, tags)` — best-effort parse of the cleaned
     answer into a tagged shape (see `workflow_shapes`) for storage.
     Returns None on parse failure; the raw answer is always preserved.

Every non-None return of `parse_answer` is a dict carrying a `kind`
discriminant. Scalars are boxed rather than returned bare (`12.5` becomes
`{"kind": "metric", "value": 12.5, …}`) so that consumers can switch on `kind`
without first testing the Python/JS type of the payload.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.services.workflow_shapes import (
    bool_shape,
    currency_shape,
    date_shape,
    enum_shape,
    kv_shape,
    list_shape,
    metric_shape,
    prose_shape,
)


_BULLET_LINE_RE = re.compile(r"^\s*[-*•]\s+(.*\S)\s*$")
_NUMBER_RE = re.compile(r"-?\d{1,3}(?:[, ]\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?")
_PERCENT_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*%")
_SOURCE_RE = re.compile(r"\[Source\s+\d+\]", re.IGNORECASE)
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
        " If the value is present, append only the supporting [Source N] marker "
        "after the value. If the value is not found, return an empty string. "
        "Do not write 'not stated', 'not found', 'N/A', or any explanation."
    )

    if fmt == "metric":
        return (
            " Return one compact metric value only, preserving any unit, currency, "
            "percentage sign, magnitude suffix, and period if present. Examples: "
            "$50.4M FY2024, 12.5%, 2.1x MOIC, 18 months." + base_cite
        )
    if fmt == "bool":
        return " Answer with exactly one of: 'Yes' or 'No'." + base_cite
    if fmt == "enum":
        if tags:
            options = ", ".join(tags)
            return f" Return exactly one label from this list: {options}." + base_cite
        return " Return one short categorical label only." + base_cite
    if fmt == "prose":
        return (
            " Return valid JSON only with this shape: "
            '{"summary": string, "body": string, "caveats": [{"text": string, '
            '"severity": "info" | "warn" | "risk"}]}. Summary is one sentence. '
            "Body contains the full analyst-usable prose answer. Surface any "
            "'but', 'unless', exception, or caveat as a caveat with severity warn "
            "or risk. Put [Source N] markers inside the relevant string values."
        )
    if fmt == "list":
        return (
            " Return valid JSON only with this shape: "
            '{"items": [{"text": string}], "ordered": boolean}. Each item is one '
            "trigger, event, condition, or fact; do not nest. Put [Source N] "
            "markers inside the relevant item text."
        )
    if fmt == "kv":
        return (
            " Return valid JSON only with this shape: "
            '{"pairs": [{"key": string, "value": string | number, "unit": string}]}. '
            "Use the canonical key names from the prompt when possible. Put "
            "[Source N] markers inside the relevant key or value strings."
        )
    if fmt == "yes_no":
        return (
            " Answer with exactly one of: 'Yes' or 'No'." + base_cite
        )
    if fmt == "number":
        return (
            " Return one scalar number only. No label, no units, no commas, no "
            "sentence. Example: 1234 or 12.5. If the document gives a range, use "
            "the midpoint." + base_cite
        )
    if fmt == "percentage":
        return (
            " Return one percentage value only. No label, no sentence. Example: "
            "42% or 12.5%." + base_cite
        )
    if fmt == "monetary_amount":
        return (
            " Return one monetary value only. Keep the currency symbol/code and "
            "magnitude if shown, but do not include labels, periods, explanations, "
            "or surrounding text. Examples: $50.4M, €1.2B, USD 12.5M." + base_cite
        )
    if fmt == "currency":
        return (
            " Return ISO currency code(s) only. If multiple, comma-separate them."
            + base_cite
        )
    if fmt == "date":
        return (
            "Return one ISO date only (YYYY-MM-DD). If only a year is "
            "stated, respond 'YYYY-01-01'. If a range, respond 'YYYY-MM-DD to "
            "YYYY-MM-DD'." + base_cite
        )
    if fmt == "bulleted_list":
        return (
            " Return at most 3 compact bullets. Each bullet must be one extracted "
            "fact or value, not a paragraph. No heading, no surrounding prose."
            + base_cite
        )
    if fmt == "tag":
        if tags:
            options = ", ".join(tags)
            return (
                f" Return exactly one label from this list: {options}." + base_cite
            )
        return base_cite
    if fmt == "markdown":
        # No shape or length constraint — emit whatever markdown the prompt
        # asks for, including tables and multi-section headings. Used for
        # columns where the LLM needs full markdown freedom.
        return base_cite
    # Default: text / bulleted_list (no tags) / unknown.
    return (
        " Return the shortest analyst-usable extracted value: a phrase or one "
        "short sentence maximum. No generic caveats." + base_cite
    )


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


def _strip_sources(value: str) -> str:
    return _SOURCE_RE.sub("", value or "").strip()


def _strip_code_fence(value: str) -> str:
    stripped = value.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.IGNORECASE | re.DOTALL)
    return fence.group(1).strip() if fence else stripped


def _load_json_object(answer: str) -> dict[str, Any] | None:
    stripped = _strip_code_fence(answer)
    try:
        value = json.loads(stripped)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        pass

    # Defensive fallback for answers that wrap the JSON in a sentence.
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        try:
            value = json.loads(stripped[start:end + 1])
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _first_sentence(answer: str) -> str:
    cleaned = " ".join(_strip_sources(answer).split())
    if not cleaned:
        return ""
    match = re.search(r"(.+?[.!?])(?:\s|$)", cleaned)
    return match.group(1).strip() if match else cleaned


def _looks_list_shaped(answer: str) -> bool:
    lines = [line.strip() for line in answer.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    bullet_count = sum(1 for line in lines if _BULLET_LINE_RE.match(line) or re.match(r"^\d+\.\s+", line))
    return bullet_count >= 2


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


def _parse_bool_shape(answer: str) -> dict[str, Any] | None:
    parsed = _parse_yes_no(answer)
    if parsed is None:
        return None
    return bool_shape(parsed)


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
    return metric_shape(
        amount,
        unit=currencies[0] if currencies else None,
        raw=_strip_sources(answer) or None,
    )


def _parse_metric(answer: str) -> dict | None:
    cleaned = _strip_sources(answer)
    value = _parse_number(cleaned)
    if value is None:
        return None

    currencies = _parse_currency(cleaned)
    unit_parts: list[str] = []
    if currencies:
        unit_parts.append(currencies[0])
    if "%" in cleaned:
        unit_parts.append("%")
    magnitude = re.search(r"\b(?:thousand|million|billion|mm|bn)\b|(?<=\d)\s*[kKmMbB]\b", cleaned)
    if magnitude:
        unit_parts.append(magnitude.group(0).strip())
    multiple = re.search(r"\b(?:x|turns?|moic|dpi|irr)\b", cleaned, re.IGNORECASE)
    if multiple:
        unit_parts.append(multiple.group(0))

    period = None
    period_match = re.search(
        r"\b(?:FY|LTM|Q[1-4]|H[12])\s*'?20\d{2}\b|\b20\d{2}\b",
        cleaned,
        re.IGNORECASE,
    )
    if period_match:
        period = period_match.group(0)

    unit = " ".join(dict.fromkeys(part for part in unit_parts if part)) or None
    return metric_shape(value, unit=unit, period=period, raw=cleaned.strip() or None)


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


def _parse_date_shape(answer: str) -> dict | None:
    cleaned = _strip_sources(answer)
    iso = _parse_date(cleaned)
    if not iso:
        return None
    granularity = "day"
    if re.search(r"\bQ[1-4]\s*'?20\d{2}\b", cleaned, re.IGNORECASE):
        granularity = "quarter"
    elif re.search(r"\b(19|20)\d{2}\b", cleaned) and not re.search(r"\d{4}-\d{2}-\d{2}", cleaned) and not _DATE_VERBOSE_RE.search(cleaned):
        granularity = "year"
    elif re.search(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(?:19|20)\d{2}\b", cleaned, re.IGNORECASE):
        granularity = "month"
    return date_shape(iso, granularity)


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


def _normalize_list_item(item: Any) -> dict[str, Any] | None:
    if isinstance(item, str):
        text = _strip_sources(item)
        return {"text": text} if text else None
    if isinstance(item, dict):
        text = _strip_sources(str(item.get("text") or ""))
        if not text:
            return None
        citation_ids = item.get("citation_ids")
        normalized = {"text": text}
        if isinstance(citation_ids, list):
            normalized["citation_ids"] = [str(v) for v in citation_ids if v is not None]
        return normalized
    return None


def _parse_list_shape(answer: str) -> dict | None:
    obj = _load_json_object(answer)
    if obj is not None:
        raw_items = obj.get("items")
        if isinstance(raw_items, list):
            items = []
            for item in raw_items:
                normalized = _normalize_list_item(item)
                if normalized:
                    items.append(normalized)
            return list_shape(items, bool(obj.get("ordered", False)))

    legacy_items = _parse_bulleted_list(answer)
    numbered = any(re.match(r"^\s*\d+\.\s+", line) for line in answer.splitlines())
    return list_shape(
        [{"text": _strip_sources(item)} for item in legacy_items if _strip_sources(item)],
        numbered,
    )


def _normalize_caveat(item: Any) -> dict[str, Any] | None:
    if isinstance(item, str):
        text = _strip_sources(item)
        return {"text": text, "severity": "info"} if text else None
    if not isinstance(item, dict):
        return None
    text = _strip_sources(str(item.get("text") or ""))
    if not text:
        return None
    severity = str(item.get("severity") or "info").lower()
    if severity not in {"info", "warn", "risk"}:
        severity = "info"
    normalized: dict[str, Any] = {"text": text, "severity": severity}
    citation_ids = item.get("citation_ids")
    if isinstance(citation_ids, list):
        normalized["citation_ids"] = [str(v) for v in citation_ids if v is not None]
    return normalized


def _parse_prose(answer: str) -> dict:
    obj = _load_json_object(answer)
    if obj is not None:
        summary = _strip_sources(str(obj.get("summary") or ""))
        body = _strip_sources(str(obj.get("body") or ""))
        caveats_raw = obj.get("caveats") if isinstance(obj.get("caveats"), list) else []
        caveats = []
        for caveat in caveats_raw:
            normalized = _normalize_caveat(caveat)
            if normalized:
                caveats.append(normalized)
        if not body:
            body = summary
        if not summary:
            summary = _first_sentence(body)
        return prose_shape(summary, body, caveats)

    cleaned = _strip_sources(answer)
    caveats = []
    if _looks_list_shaped(cleaned):
        caveats.append({
            "text": "Answer looks list-shaped — consider switching column to List.",
            "severity": "info",
        })
    elif re.search(r"\b(?:but|however|unless|except|provided that)\b", cleaned, re.IGNORECASE):
        caveats.append({
            "text": "Review caveat language in the answer.",
            "severity": "warn",
        })
    return prose_shape(_first_sentence(cleaned), cleaned, caveats)


def _parse_tag(answer: str, tags: list[str] | None) -> str | None:
    if not tags:
        return answer.strip() or None
    lowered = answer.lower()
    for tag in tags:
        if tag.lower() in lowered:
            return tag
    return None


def _parse_enum(answer: str, tags: list[str] | None) -> dict | None:
    parsed = _parse_tag(answer, tags)
    if parsed is None:
        parsed = _strip_sources(answer).splitlines()[0].strip() if _strip_sources(answer) else None
    if not parsed:
        return None
    return enum_shape(parsed, tags)


def _normalize_kv_pair(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    key = _strip_sources(str(item.get("key") or ""))
    value = item.get("value")
    if not key or value is None:
        return None
    normalized: dict[str, Any] = {
        "key": key,
        "value": _strip_sources(value) if isinstance(value, str) else value,
    }
    unit = item.get("unit")
    if unit is not None and str(unit).strip():
        normalized["unit"] = str(unit).strip()
    return normalized


def _parse_kv(answer: str) -> dict | None:
    obj = _load_json_object(answer)
    if obj is not None and isinstance(obj.get("pairs"), list):
        pairs = []
        for pair in obj["pairs"]:
            normalized = _normalize_kv_pair(pair)
            if normalized:
                pairs.append(normalized)
        return kv_shape(pairs)

    pairs = []
    for part in re.split(r";|\n", answer):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        key = _strip_sources(key)
        value = _strip_sources(value)
        if key and value:
            pairs.append({"key": key, "value": value})
    return kv_shape(pairs) if pairs else None


def parse_answer(answer: str, fmt: str, tags: list[str] | None = None) -> dict[str, Any] | None:
    """Best-effort structured parse of an LLM answer per column format.

    Always returns either None (parse failed — callers preserve the raw answer)
    or a tagged shape carrying a `kind`. The formats that historically returned
    bare scalars (`yes_no`, `number`, `percentage`, `currency`, `bulleted_list`,
    `tag`) are boxed into the shape their format maps to in
    `workflow_shapes.KIND_BY_FORMAT`.
    """
    if not answer:
        return None
    if fmt == "metric":
        return _parse_metric(answer)
    if fmt == "bool":
        return _parse_bool_shape(answer)
    if fmt == "enum":
        return _parse_enum(answer, tags)
    if fmt == "prose":
        return _parse_prose(answer)
    if fmt == "list":
        return _parse_list_shape(answer)
    if fmt == "kv":
        return _parse_kv(answer)
    if fmt == "yes_no":
        return _parse_bool_shape(answer)
    if fmt == "number":
        value = _parse_number(answer)
        return None if value is None else metric_shape(value, raw=_strip_sources(answer) or None)
    if fmt == "percentage":
        value = _parse_percent(answer)
        return (
            None
            if value is None
            else metric_shape(value, unit="%", raw=_strip_sources(answer) or None)
        )
    if fmt == "monetary_amount":
        return _parse_monetary(answer)
    if fmt == "currency":
        codes = _parse_currency(answer)
        return currency_shape(codes) if codes else None
    if fmt == "date":
        return _parse_date_shape(answer)
    if fmt == "bulleted_list":
        items = [
            {"text": _strip_sources(item)}
            for item in _parse_bulleted_list(answer)
            if _strip_sources(item)
        ]
        numbered = any(re.match(r"^\s*\d+\.\s+", line) for line in answer.splitlines())
        return list_shape(items, numbered) if items else None
    if fmt == "tag":
        parsed = _parse_tag(answer, tags)
        return enum_shape(parsed.strip(), tags) if parsed and parsed.strip() else None
    return None
