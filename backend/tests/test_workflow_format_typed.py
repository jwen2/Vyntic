import json
from types import SimpleNamespace

from app.services.workflow_format import format_prompt_suffix, parse_answer
from app.services.workflow_run_store import _row_to_cell
from app.services.workflow_shapes import display_text, kv_shape, normalize_shape


def test_metric_parser_extracts_value_unit_period():
    parsed = parse_answer("$847.5M FY2024 [Source 1]", "metric")

    assert parsed == {
        "kind": "metric",
        "value": 847.5,
        "unit": "USD M",
        "period": "FY2024",
        "raw": "$847.5M FY2024",
    }


def test_date_parser_returns_iso_and_granularity():
    parsed = parse_answer("2026-03-31 [Source 2]", "date")

    assert parsed == {"kind": "date", "iso": "2026-03-31", "granularity": "day"}


def test_bool_parser_wraps_boolean_shape():
    assert parse_answer("Yes [Source 1]", "bool") == {"kind": "bool", "value": True}
    assert parse_answer("No [Source 1]", "bool") == {"kind": "bool", "value": False}


def test_enum_parser_uses_allowed_values():
    parsed = parse_answer("Medium [Source 3]", "enum", ["High", "Medium", "Low"])

    assert parsed == {"kind": "enum", "value": "Medium", "allowed": ["High", "Medium", "Low"]}


def test_prose_parser_accepts_json_and_normalizes_caveats():
    parsed = parse_answer(
        """
        ```json
        {
          "summary": "MAE carveouts are broad. [Source 1]",
          "body": "The clause excludes market, industry, announcement, and force majeure impacts. [Source 1]",
          "caveats": [{"text": "Buyer walk-right may be limited. [Source 1]", "severity": "risk"}]
        }
        ```
        """,
        "prose",
    )

    # Markers are preserved — they are what maps a claim back to its source page.
    assert parsed == {
        "kind": "prose",
        "summary": "MAE carveouts are broad. [Source 1]",
        "body": (
            "The clause excludes market, industry, announcement, and force majeure "
            "impacts. [Source 1]"
        ),
        "caveats": [{"text": "Buyer walk-right may be limited. [Source 1]", "severity": "risk"}],
    }


def test_prose_parser_falls_back_for_plain_text():
    parsed = parse_answer(
        "The clause is buyer-friendly, but survival is limited to 12 months. [Source 1]",
        "prose",
    )

    assert parsed["kind"] == "prose"
    # The marker trails the final period, so it falls outside the first sentence
    # but is kept in the body.
    assert parsed["summary"] == "The clause is buyer-friendly, but survival is limited to 12 months."
    assert parsed["body"] == (
        "The clause is buyer-friendly, but survival is limited to 12 months. [Source 1]"
    )
    assert parsed["caveats"] == [
        {"text": "Review caveat language in the answer.", "severity": "warn"}
    ]


def test_list_parser_accepts_json_and_plain_bullets():
    json_parsed = parse_answer(
        '{"items": [{"text": "Drop-dead date [Source 1]"}, {"text": "HSR failure [Source 2]"}], "ordered": false}',
        "list",
    )
    bullet_parsed = parse_answer("- Drop-dead date [Source 1]\n- HSR failure [Source 2]", "list")

    assert json_parsed == {
        "kind": "list",
        "items": [{"text": "Drop-dead date [Source 1]"}, {"text": "HSR failure [Source 2]"}],
        "ordered": False,
    }
    assert bullet_parsed == json_parsed


def test_kv_parser_accepts_json_and_colon_pairs():
    json_parsed = parse_answer(
        '{"pairs": [{"key": "Cap", "value": "10% EV", "unit": ""}, {"key": "Basket", "value": "$1.5M"}]}',
        "kv",
    )
    plain_parsed = parse_answer("Cap: 10% EV; Basket: $1.5M [Source 1]", "kv")

    assert json_parsed == {
        "kind": "kv",
        "pairs": [{"key": "Cap", "value": "10% EV"}, {"key": "Basket", "value": "$1.5M"}],
    }
    # The plain-text fallback keeps the marker it found on the trailing value.
    assert plain_parsed == {
        "kind": "kv",
        "pairs": [
            {"key": "Cap", "value": "10% EV"},
            {"key": "Basket", "value": "$1.5M [Source 1]"},
        ],
    }


def test_scalar_formats_are_boxed_into_tagged_shapes():
    """Formats that used to return bare scalars now return tagged shapes."""
    assert parse_answer("Yes [Source 1]", "yes_no") == {"kind": "bool", "value": True}
    assert parse_answer("12.5% [Source 1]", "percentage") == {
        "kind": "metric",
        "value": 12.5,
        "unit": "%",
        "period": None,
        "raw": "12.5%",
    }
    assert parse_answer("123 [Source 1]", "number") == {
        "kind": "metric",
        "value": 123.0,
        "unit": None,
        "period": None,
        "raw": "123",
    }
    assert parse_answer("USD and EUR [Source 1]", "currency") == {
        "kind": "currency",
        "codes": ["USD", "EUR"],
    }
    assert parse_answer("- One [Source 1]\n- Two [Source 2]", "bulleted_list") == {
        "kind": "list",
        "items": [{"text": "One [Source 1]"}, {"text": "Two [Source 2]"}],
        "ordered": False,
    }
    assert parse_answer("High [Source 1]", "tag", ["High", "Low"]) == {
        "kind": "enum",
        "value": "High",
        "allowed": ["High", "Low"],
    }


def test_known_bug_number_parser_truncates_unseparated_long_numbers():
    """Characterization, NOT an endorsement — `_NUMBER_RE` truncates here.

    Its thousands-separator alternative (`\\d{1,3}(?:[, ]\\d{3})*`) is tried
    first and matches only the leading 3 digits of an unseparated number, so
    "12345" parses as 123.0 while "12,345" parses correctly. Pre-dates the
    tagged-shape work and affects every numeric format; pinned here so a fix
    is a deliberate, visible change rather than a silent one.
    """
    assert parse_answer("12345", "number")["value"] == 123.0
    assert parse_answer("12,345", "number")["value"] == 12345.0


def test_every_parsed_shape_carries_a_kind():
    """The contract: parse_answer returns None or a dict with a valid `kind`."""
    samples = [
        ("$50.4M FY2024", "metric"),
        ("2026-03-31", "date"),
        ("Yes", "bool"),
        ("Yes", "yes_no"),
        ("Medium", "enum"),
        ("Medium", "tag"),
        ("USD", "currency"),
        ("Some prose answer.", "prose"),
        ("- One\n- Two", "list"),
        ("- One\n- Two", "bulleted_list"),
        ("Cap: 10%", "kv"),
        ("1234", "number"),
        ("12.5%", "percentage"),
        ("$1.5M", "monetary_amount"),
    ]
    for answer, fmt in samples:
        parsed = parse_answer(answer, fmt)
        assert isinstance(parsed, dict), f"{fmt} did not return a shape"
        assert parsed.get("kind"), f"{fmt} shape is missing its kind discriminant"


def test_unshaped_formats_return_none():
    assert parse_answer("Anything at all", "text") is None
    assert parse_answer("## Heading\n\nBody", "markdown") is None
    assert parse_answer("", "kv") is None


def test_prompt_suffixes_for_json_shapes_are_explicit():
    assert "valid JSON only" in format_prompt_suffix("prose")
    assert "valid JSON only" in format_prompt_suffix("list")
    assert "valid JSON only" in format_prompt_suffix("kv")


# ── normalize_shape: legacy payloads written before `kind` existed ──


def test_normalize_upgrades_legacy_untagged_dicts():
    assert normalize_shape({"pairs": [{"key": "Cap", "value": "10%"}]})["kind"] == "kv"
    assert normalize_shape({"items": [{"text": "One"}], "ordered": True})["kind"] == "list"
    assert normalize_shape({"summary": "S", "body": "B", "caveats": []})["kind"] == "prose"
    assert normalize_shape({"iso": "2026-03-31", "granularity": "day"})["kind"] == "date"
    assert normalize_shape({"value": True})["kind"] == "bool"
    assert normalize_shape({"value": "High", "allowed": ["High"]})["kind"] == "enum"
    assert normalize_shape({"value": 12.5, "unit": "%"})["kind"] == "metric"


def test_normalize_upgrades_legacy_monetary_payload():
    """The old monetary_amount shape was {amount, currency, raw}."""
    normalized = normalize_shape({"amount": 1500000.0, "currency": "USD", "raw": "$1.5M"})

    assert normalized == {
        "kind": "metric",
        "value": 1500000.0,
        "unit": "USD",
        "period": None,
        "raw": "$1.5M",
    }


def test_normalize_boxes_legacy_bare_scalars():
    assert normalize_shape(True) == {"kind": "bool", "value": True}
    assert normalize_shape(12.5)["kind"] == "metric"
    assert normalize_shape("Medium") == {"kind": "enum", "value": "Medium"}
    assert normalize_shape(["One", "Two"]) == {
        "kind": "list",
        "items": [{"text": "One"}, {"text": "Two"}],
        "ordered": False,
    }


def test_normalize_discriminates_legacy_currency_lists_from_bullet_lists():
    """`currency` and `bulleted_list` both stored a bare list of strings."""
    assert normalize_shape(["USD", "EUR"]) == {"kind": "currency", "codes": ["USD", "EUR"]}
    assert normalize_shape(["Drop-dead date", "HSR failure"])["kind"] == "list"


def test_normalize_is_idempotent_and_tolerant():
    tagged = parse_answer("Cap: 10% EV", "kv")

    assert normalize_shape(tagged) == tagged
    assert normalize_shape(normalize_shape(tagged)) == tagged
    assert normalize_shape(None) is None
    assert normalize_shape({}) is None
    assert normalize_shape([]) is None
    assert normalize_shape("") is None


# ── display_text: the one shape → text flattener ──


def test_display_text_renders_every_shape_as_text_not_json():
    kv = parse_answer(
        '{"pairs": [{"key": "Ongoing", "value": "2.00% of commitments", "unit": "percent"},'
        ' {"key": "One-time", "value": "$1.25 million cap", "unit": "USD"}]}',
        "kv",
    )

    # The units are suppressed: "%" already conveys "percent", "$" conveys USD.
    full = display_text(kv)
    assert full == "- Ongoing: 2.00% of commitments\n- One-time: $1.25 million cap"
    assert "{" not in full and "pairs" not in full
    assert display_text(kv, compact=True) == (
        "Ongoing: 2.00% of commitments; One-time: $1.25 million cap"
    )


def test_display_text_keeps_a_unit_the_value_does_not_convey():
    shape = kv_shape([
        {"key": "Survival", "value": "18", "unit": "months"},
        {"key": "Cap", "value": "10", "unit": "%"},
    ])

    assert display_text(shape) == "- Survival: 18 months\n- Cap: 10 %"


def test_display_text_keeps_markers_by_default_and_strips_on_request():
    """Markers survive into the shape so the panel can render them as anchors."""
    shape = parse_answer(
        '{"items": [{"text": "Drop-dead date [Source 1]"}, {"text": "HSR failure [Source 2]"}]}',
        "list",
    )

    assert display_text(shape) == "- Drop-dead date [Source 1]\n- HSR failure [Source 2]"
    # Stripping happens per field, before formatting — stripping the joined
    # output would leave the separator's leading space ("date ; HSR failure").
    assert display_text(shape, strip_sources=True) == "- Drop-dead date\n- HSR failure"
    assert display_text(shape, compact=True, strip_sources=True) == "Drop-dead date; HSR failure"


def test_display_text_list_uses_markdown_bullets_or_numbers():
    unordered = parse_answer('{"items": [{"text": "One"}, {"text": "Two"}], "ordered": false}', "list")
    ordered = parse_answer('{"items": [{"text": "One"}, {"text": "Two"}], "ordered": true}', "list")

    assert display_text(unordered) == "- One\n- Two"
    assert display_text(ordered) == "1. One\n2. Two"
    assert display_text(unordered, compact=True) == "One; Two"


def test_display_text_prose_prefers_body_but_compact_prefers_summary():
    prose = parse_answer(
        '{"summary": "Short.", "body": "The long analyst-usable body.", "caveats": []}',
        "prose",
    )

    assert display_text(prose) == "The long analyst-usable body."
    assert display_text(prose, compact=True) == "Short."


def test_display_text_scalars():
    assert display_text(parse_answer("Yes", "bool")) == "Yes"
    assert display_text(parse_answer("No", "bool")) == "No"
    assert display_text(parse_answer("2026-03-31", "date")) == "2026-03-31"
    assert display_text(parse_answer("Medium", "enum", ["Medium"])) == "Medium"
    assert display_text(parse_answer("USD and EUR", "currency")) == "USD, EUR"
    assert display_text(parse_answer("$847.5M FY2024", "metric")) == "$847.5M FY2024"
    assert display_text(None) == ""


def test_display_text_normalizes_legacy_payloads_too():
    """Legacy untagged input flattens without a caller having to normalize first."""
    assert display_text({"pairs": [{"key": "Cap", "value": "10%"}]}) == "- Cap: 10%"
    assert display_text({"summary": "S", "body": "B"}) == "B"


# ── The store read boundary: where legacy rows become tagged shapes ──


def _cell_row(answer: str, formatted_json: str):
    """A stand-in for TabularCellRow — `_row_to_cell` only reads attributes."""
    return SimpleNamespace(
        id="cell1",
        run_id="run1",
        row_key="doc1",
        column_id="col1",
        status="complete",
        answer=answer,
        answer_formatted_json=formatted_json,
        citations_json="[]",
        model="test",
        fallback=False,
        duration_ms=0,
        error_message=None,
        started_at=None,
        completed_at=None,
    )


def test_store_tags_legacy_rows_and_fills_answer_display():
    """A pre-`kind` kv row read back is indistinguishable from a new one."""
    pairs = [
        {"key": "Ongoing", "value": "2.00% of commitments", "unit": "percent"},
        {"key": "One-time", "value": "$1.25 million cap", "unit": "USD"},
    ]
    cell = _row_to_cell(_cell_row(json.dumps({"pairs": pairs}), json.dumps({"pairs": pairs})))

    assert cell.answer_formatted["kind"] == "kv"
    # The regression this fixes: `answer` is a JSON blob, so a text surface must
    # read `answer_display` instead — and that must never contain JSON.
    assert cell.answer.lstrip().startswith("{")
    assert "{" not in cell.answer_display
    assert cell.answer_display == (
        "- Ongoing: 2.00% of commitments\n- One-time: $1.25 million cap"
    )


def test_store_falls_back_to_raw_answer_when_a_cell_has_no_shape():
    """text/markdown columns keep their answer verbatim, [Source N] markers included."""
    cell = _row_to_cell(_cell_row("Plain prose answer. [Source 1]", "null"))

    assert cell.answer_formatted is None
    assert cell.answer_display == "Plain prose answer. [Source 1]"


def test_store_tolerates_corrupt_formatted_json():
    cell = _row_to_cell(_cell_row("Fallback answer", "{not json"))

    assert cell.answer_formatted is None
    assert cell.answer_display == "Fallback answer"
