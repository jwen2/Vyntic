"""Canonical typed-cell shapes — the tagged contract every consumer reads.

Background: `TabularCell` carries the raw LLM output in `answer` and the parsed
value in `answer_formatted`. For the JSON-directive formats (`prose`, `list`,
`kv`) the raw answer *is* a JSON blob, so any surface that renders `answer` as
text dumps JSON at the analyst. And because `answer_formatted` used to be an
*untagged* dict, every consumer had to guess the shape from which keys happened
to exist (`"pairs" in obj`, `Array.isArray(obj.items)`, …). That test was
re-implemented in seven places, each covering a different subset — which is how
`kv` cells ended up rendering as raw JSON in the cell-detail panel.

This module fixes the contract in one place:

  * every shape carries a `kind` discriminant, so consumers switch instead of
    sniff (and TypeScript can narrow the union exhaustively);
  * `normalize_shape` upgrades legacy untagged payloads on read, so stored runs
    need no migration and no backfill;
  * `display_text` is the one flattener from shape to analyst-readable text,
    shared by the API's `answer_display` and the Excel/Word exports.

Adding a shape means adding a `kind` here — after which the frontend's
exhaustive switches fail to compile until they handle it. That is the point.
"""
from __future__ import annotations

import re
from typing import Any

# Canonical shape kinds. These describe the *shape*, not the column format —
# several formats collapse onto one shape (`number`/`percentage`/`metric` all
# produce a numeric-with-unit).
SHAPE_KINDS = ("metric", "date", "bool", "enum", "currency", "prose", "list", "kv")

# Column format → shape kind. Formats absent here (`text`, `markdown`, unknown)
# produce no shape at all; their consumers fall back to the raw answer.
KIND_BY_FORMAT: dict[str, str] = {
    "metric": "metric",
    "number": "metric",
    "percentage": "metric",
    "monetary_amount": "metric",
    "currency": "currency",
    "date": "date",
    "bool": "bool",
    "yes_no": "bool",
    "enum": "enum",
    "tag": "enum",
    "prose": "prose",
    "list": "list",
    "bulleted_list": "list",
    "kv": "kv",
}

_CURRENCY_CODES = {
    "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CNY", "CHF", "HKD", "INR", "SGD",
}
_SOURCE_RE = re.compile(r"\[Source\s+\d+\]", re.IGNORECASE)

# Symbols/words that mean the same thing as a kv pair's `unit`. The model often
# writes the unit into the value *and* the unit field ("2.00% of commitments"
# + unit "percent"), which reads as "…of commitments percent" when joined.
_UNIT_SYNONYMS: dict[str, tuple[str, ...]] = {
    "percent": ("%", "percent", "pct"),
    "%": ("%", "percent", "pct"),
    "usd": ("$", "usd", "dollar"),
    "eur": ("€", "eur", "euro"),
    "gbp": ("£", "gbp", "pound"),
    "jpy": ("¥", "jpy", "yen"),
}


def _unit_is_redundant(value: Any, unit: str) -> bool:
    """True when the value already conveys the unit.

    Conservative by design: only suppresses a unit whose own text (or a known
    symbol for it) is already present in the value. A unit the value doesn't
    mention — "18" + "months" — is always kept.
    """
    if not unit:
        return True
    text = str(value).lower()
    key = unit.strip().lower()
    for token in _UNIT_SYNONYMS.get(key, (key,)):
        if token and token in text:
            return True
    return False


def _strip_sources(value: str) -> str:
    return _SOURCE_RE.sub("", value or "").strip()


# ── Shape constructors ──
#
# Kept as functions rather than literals so `parse_answer` and `normalize_shape`
# can't drift apart on field names or defaults.


def metric_shape(
    value: float | None,
    unit: str | None = None,
    period: str | None = None,
    raw: str | None = None,
) -> dict[str, Any]:
    return {"kind": "metric", "value": value, "unit": unit, "period": period, "raw": raw}


def date_shape(iso: str, granularity: str = "day") -> dict[str, Any]:
    return {"kind": "date", "iso": iso, "granularity": granularity}


def bool_shape(value: bool) -> dict[str, Any]:
    return {"kind": "bool", "value": value}


def enum_shape(value: str, allowed: list[str] | None = None) -> dict[str, Any]:
    shape: dict[str, Any] = {"kind": "enum", "value": value}
    if allowed:
        shape["allowed"] = allowed
    return shape


def currency_shape(codes: list[str]) -> dict[str, Any]:
    return {"kind": "currency", "codes": codes}


def prose_shape(summary: str, body: str, caveats: list[dict[str, Any]]) -> dict[str, Any]:
    return {"kind": "prose", "summary": summary, "body": body, "caveats": caveats}


def list_shape(items: list[dict[str, Any]], ordered: bool = False) -> dict[str, Any]:
    return {"kind": "list", "items": items, "ordered": bool(ordered)}


def kv_shape(pairs: list[dict[str, Any]]) -> dict[str, Any]:
    return {"kind": "kv", "pairs": pairs}


# ── Legacy normalization ──


def _looks_like_currency_codes(values: list[Any]) -> bool:
    """True when a bare list is the old `currency` payload (`["USD", "EUR"]`).

    `currency` and `bulleted_list` both used to store a bare list of strings,
    so the kind can't be recovered from the container alone. ISO codes are a
    closed set, which makes the discrimination deterministic rather than a
    guess.
    """
    return bool(values) and all(
        isinstance(item, str) and item.strip().upper() in _CURRENCY_CODES for item in values
    )


def normalize_shape(value: Any) -> dict[str, Any] | None:
    """Upgrade any stored `answer_formatted` payload to a tagged shape.

    Applied at the store's read boundary, so cells written before the `kind`
    discriminant existed are indistinguishable from new ones by the time they
    reach a consumer.

    Deliberately normalizes the *stored* payload rather than re-parsing
    `cell.answer`: column formats are editable after a run, so re-parsing an
    old answer under a since-changed format would silently rewrite run history.

    Purely a re-tagging: it never rewrites the text it finds. In particular it
    leaves `[Source N]` markers alone, so legacy `bulleted_list` rows (which
    stored their markers) keep them and stay citable.

    Returns None for anything unrecognizable — callers fall back to the raw
    answer, exactly as they did before a shape existed.
    """
    if value is None:
        return None

    if isinstance(value, bool):  # before int — bool is an int subclass
        return bool_shape(value)
    if isinstance(value, (int, float)):
        return metric_shape(float(value), raw=str(value))
    if isinstance(value, str):
        cleaned = value.strip()
        return enum_shape(cleaned) if cleaned else None
    if isinstance(value, list):
        strings = [str(item).strip() for item in value if item is not None and str(item).strip()]
        if not strings:
            return None
        if _looks_like_currency_codes(strings):
            return currency_shape([item.upper() for item in strings])
        return list_shape([{"text": item} for item in strings])
    if not isinstance(value, dict):
        return None

    kind = value.get("kind")
    if kind in SHAPE_KINDS:
        return value

    # Untagged dict — recover the kind from its keys. This is the key-sniffing
    # that used to live in seven consumers; it now lives here only.
    if "summary" in value or "body" in value:
        summary = str(value.get("summary") or "")
        body = str(value.get("body") or "")
        caveats = value.get("caveats")
        return prose_shape(
            summary or body,
            body or summary,
            caveats if isinstance(caveats, list) else [],
        )
    if isinstance(value.get("items"), list):
        items = []
        for item in value["items"]:
            if isinstance(item, dict):
                text = str(item.get("text") or "").strip()
                if text:
                    items.append({k: v for k, v in item.items() if k != "kind"})
            elif item is not None and str(item).strip():
                items.append({"text": str(item).strip()})
        return list_shape(items, bool(value.get("ordered", False)))
    if isinstance(value.get("pairs"), list):
        pairs = [pair for pair in value["pairs"] if isinstance(pair, dict) and pair.get("key")]
        return kv_shape(pairs)
    if value.get("iso"):
        return date_shape(str(value["iso"]), str(value.get("granularity") or "day"))
    if "amount" in value:
        # The old `monetary_amount` payload: {amount, currency, raw}.
        amount = value.get("amount")
        return metric_shape(
            float(amount) if isinstance(amount, (int, float)) else None,
            unit=str(value["currency"]) if value.get("currency") else None,
            raw=str(value.get("raw") or "") or None,
        )
    if "codes" in value and isinstance(value["codes"], list):
        return currency_shape([str(code).upper() for code in value["codes"] if code])
    if "value" in value:
        inner = value.get("value")
        if isinstance(inner, bool):
            return bool_shape(inner)
        if isinstance(inner, (int, float)):
            return metric_shape(
                float(inner),
                unit=str(value["unit"]) if value.get("unit") else None,
                period=str(value["period"]) if value.get("period") else None,
                raw=str(value["raw"]) if value.get("raw") else None,
            )
        if isinstance(inner, str) and inner.strip():
            allowed = value.get("allowed")
            return enum_shape(
                inner.strip(),
                [str(item) for item in allowed] if isinstance(allowed, list) else None,
            )
    return None


# ── Display text ──


def strip_shape_sources(shape: Any) -> dict[str, Any] | None:
    """A copy of the shape with `[Source N]` markers removed from its text.

    Only the text-bearing shapes carry markers; scalar shapes pass through.
    """
    shape = normalize_shape(shape)
    if shape is None:
        return None
    kind = shape.get("kind")
    if kind == "prose":
        return {
            **shape,
            "summary": _strip_sources(str(shape.get("summary") or "")),
            "body": _strip_sources(str(shape.get("body") or "")),
            "caveats": [
                {**caveat, "text": _strip_sources(str(caveat.get("text") or ""))}
                for caveat in shape.get("caveats") or []
                if isinstance(caveat, dict)
            ],
        }
    if kind == "list":
        return {
            **shape,
            "items": [
                {**item, "text": _strip_sources(str(item.get("text") or ""))}
                for item in shape.get("items") or []
                if isinstance(item, dict)
            ],
        }
    if kind == "kv":
        pairs = []
        for pair in shape.get("pairs") or []:
            if not isinstance(pair, dict):
                continue
            value = pair.get("value")
            unit = pair.get("unit")
            pairs.append({
                **pair,
                "key": _strip_sources(str(pair.get("key") or "")),
                "value": _strip_sources(value) if isinstance(value, str) else value,
                "unit": _strip_sources(unit) if isinstance(unit, str) else unit,
            })
        return {**shape, "pairs": pairs}
    return shape


def _metric_text(shape: dict[str, Any]) -> str:
    raw = str(shape.get("raw") or "").strip()
    if raw:
        return raw
    value = shape.get("value")
    if value is None:
        return ""
    number = int(value) if isinstance(value, float) and value.is_integer() else value
    return " ".join(part for part in [str(number), shape.get("unit")] if part)


def display_text(shape: Any, compact: bool = False, strip_sources: bool = False) -> str:
    """Flatten a tagged shape to analyst-readable text.

    `compact=True` yields the one-line form used by spreadsheet exports (a
    prose summary, semicolon-joined list items); the default yields the full
    form used by the cell-detail panel, where list and kv shapes become
    markdown so `AnswerText` renders them as real bullets and lines.

    `strip_sources=True` removes `[Source N]` markers. The default keeps them,
    because the text-bearing shapes carry markers by design and the panel's
    markdown renderer turns them into clickable citation anchors. Destinations
    that cannot render an anchor — spreadsheet cells, formula operands — pass
    True.
    """
    shape = normalize_shape(shape)
    if shape is None:
        return ""
    if strip_sources:
        # Strip per field, before formatting — stripping the joined output
        # would leave the separator's leading space ("Drop-dead date ; HSR").
        return display_text(strip_shape_sources(shape), compact=compact)
    kind = shape.get("kind")

    if kind == "metric":
        text = _metric_text(shape)
        period = shape.get("period")
        if period and str(period) not in text:
            text = f"{text} ({period})".strip()
        return text
    if kind == "date":
        return str(shape.get("iso") or "")
    if kind == "bool":
        return "Yes" if shape.get("value") else "No"
    if kind == "enum":
        return str(shape.get("value") or "")
    if kind == "currency":
        return ", ".join(str(code) for code in shape.get("codes") or [])
    if kind == "prose":
        summary = str(shape.get("summary") or "").strip()
        body = str(shape.get("body") or "").strip()
        return (summary or body) if compact else (body or summary)
    if kind == "list":
        items = [
            str(item.get("text") or "").strip()
            for item in shape.get("items") or []
            if isinstance(item, dict) and str(item.get("text") or "").strip()
        ]
        if not items:
            return ""
        if compact:
            return "; ".join(items)
        ordered = shape.get("ordered")
        return "\n".join(
            f"{index + 1}. {text}" if ordered else f"- {text}"
            for index, text in enumerate(items)
        )
    if kind == "kv":
        lines = []
        for pair in shape.get("pairs") or []:
            if not isinstance(pair, dict):
                continue
            key = str(pair.get("key") or "").strip()
            value = pair.get("value")
            if not key or value is None:
                continue
            unit = str(pair.get("unit") or "").strip()
            suffix = "" if _unit_is_redundant(value, unit) else f" {unit}"
            lines.append(f"{key}: {value}{suffix}")
        if not lines:
            return ""
        return "; ".join(lines) if compact else "\n".join(f"- {line}" for line in lines)
    return ""
