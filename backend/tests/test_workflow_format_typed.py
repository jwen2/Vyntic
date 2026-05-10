from app.services.workflow_format import format_prompt_suffix, parse_answer


def test_metric_parser_extracts_value_unit_period():
    parsed = parse_answer("$847.5M FY2024 [Source 1]", "metric")

    assert parsed == {
        "value": 847.5,
        "unit": "USD M",
        "period": "FY2024",
        "raw": "$847.5M FY2024",
    }


def test_date_parser_returns_iso_and_granularity():
    parsed = parse_answer("2026-03-31 [Source 2]", "date")

    assert parsed == {"iso": "2026-03-31", "granularity": "day"}


def test_bool_parser_wraps_boolean_shape():
    assert parse_answer("Yes [Source 1]", "bool") == {"value": True}
    assert parse_answer("No [Source 1]", "bool") == {"value": False}


def test_enum_parser_uses_allowed_values():
    parsed = parse_answer("Medium [Source 3]", "enum", ["High", "Medium", "Low"])

    assert parsed == {"value": "Medium", "allowed": ["High", "Medium", "Low"]}


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

    assert parsed == {
        "summary": "MAE carveouts are broad.",
        "body": "The clause excludes market, industry, announcement, and force majeure impacts.",
        "caveats": [{"text": "Buyer walk-right may be limited.", "severity": "risk"}],
    }


def test_prose_parser_falls_back_for_plain_text():
    parsed = parse_answer(
        "The clause is buyer-friendly, but survival is limited to 12 months. [Source 1]",
        "prose",
    )

    assert parsed["summary"] == "The clause is buyer-friendly, but survival is limited to 12 months."
    assert parsed["body"] == "The clause is buyer-friendly, but survival is limited to 12 months."
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
        "items": [{"text": "Drop-dead date"}, {"text": "HSR failure"}],
        "ordered": False,
    }
    assert bullet_parsed == {
        "items": [{"text": "Drop-dead date"}, {"text": "HSR failure"}],
        "ordered": False,
    }


def test_kv_parser_accepts_json_and_colon_pairs():
    json_parsed = parse_answer(
        '{"pairs": [{"key": "Cap", "value": "10% EV", "unit": ""}, {"key": "Basket", "value": "$1.5M"}]}',
        "kv",
    )
    plain_parsed = parse_answer("Cap: 10% EV; Basket: $1.5M [Source 1]", "kv")

    assert json_parsed == {
        "pairs": [{"key": "Cap", "value": "10% EV"}, {"key": "Basket", "value": "$1.5M"}]
    }
    assert plain_parsed == {
        "pairs": [{"key": "Cap", "value": "10% EV"}, {"key": "Basket", "value": "$1.5M"}]
    }


def test_legacy_formats_still_parse():
    assert parse_answer("Yes [Source 1]", "yes_no") is True
    assert parse_answer("12.5% [Source 1]", "percentage") == 12.5
    assert parse_answer("- One [Source 1]\n- Two [Source 2]", "bulleted_list") == [
        "One [Source 1]",
        "Two [Source 2]",
    ]


def test_prompt_suffixes_for_json_shapes_are_explicit():
    assert "valid JSON only" in format_prompt_suffix("prose")
    assert "valid JSON only" in format_prompt_suffix("list")
    assert "valid JSON only" in format_prompt_suffix("kv")
