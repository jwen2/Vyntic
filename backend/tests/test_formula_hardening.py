"""Formula eval hardening (F9).

The arithmetic whitelist admits `*`, so `**` slipped through — `=9**9**9`
computes an astronomically large integer synchronously on the event loop and
freezes the backend. Exponentiation and oversized expressions are rejected.
"""
from app.services.workflow_run_executor import _eval_formula


def test_exponentiation_is_rejected():
    assert _eval_formula("=9**9**9", {}) == ""


def test_exponentiation_via_column_values_is_rejected():
    assert _eval_formula("=[A]**[B]", {"A": 9, "B": 9}) == ""


def test_oversized_expression_is_rejected():
    expr = "=" + "+".join(["1"] * 200)
    assert _eval_formula(expr, {}) == ""


def test_normal_arithmetic_still_works():
    assert _eval_formula("=[A]+[B]", {"A": 1, "B": 2}) == "3"
    assert _eval_formula("=[A]*[B]", {"A": 3, "B": 4}) == "12"
    assert _eval_formula("=([A]-[B])/2", {"A": 10, "B": 4}) == "3"


def test_if_formula_still_works():
    values = {"Revenue": 100}
    assert _eval_formula('=IF([Revenue] > 50, "big", "small")', values) == "big"


def test_if_condition_supports_arithmetic_expressions():
    values = {"DPI": 0.7, "RVPI": 1.1, "TVPI": 1.8}
    formula = '=IF([DPI]+[RVPI]-[TVPI]>0.05,"mismatch","ties")'
    assert _eval_formula(formula, values) == "ties"
