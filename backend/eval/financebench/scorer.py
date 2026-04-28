"""Score model output against FinanceBench ground truth.

Two axes:
  * groundedness — programmatic: did any cited page match an evidence page?
  * accuracy     — LLM-as-judge: CORRECT / INCORRECT / REFUSED

Plus a regex refusal heuristic as a sanity backup against the judge.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Iterable

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_llm

_REFUSAL_PATTERNS = [
    r"\bi (don'?t|do not) know\b",
    r"\bnot (in|present|found|available|mentioned) (in|within) (the|this) (context|document|filing|source|excerpt)\b",
    r"\bno relevant (content|information|context)\b",
    r"\bunable to (answer|determine|find)\b",
    r"\bcannot (answer|determine|find)\b",
    r"\binsufficient (information|context|evidence)\b",
]
_REFUSAL_RE = re.compile("|".join(_REFUSAL_PATTERNS), re.IGNORECASE)


def looks_like_refusal(answer: str) -> bool:
    return bool(_REFUSAL_RE.search(answer or ""))


@dataclass
class GroundednessResult:
    expected_pages: list[int]
    cited_pages: list[int]
    page_hit: bool
    page_hit_within_1: bool


def score_groundedness(
    expected_pages: Iterable[int],
    cited_pages: Iterable[int],
) -> GroundednessResult:
    exp = sorted({p for p in expected_pages if p})
    cit = sorted({p for p in cited_pages if p})
    hit = any(c in exp for c in cit)
    hit_within_1 = any(abs(c - e) <= 1 for c in cit for e in exp)
    return GroundednessResult(
        expected_pages=exp,
        cited_pages=cit,
        page_hit=hit,
        page_hit_within_1=hit_within_1,
    )


_JUDGE_SYSTEM = """You are a strict evaluator for financial Q&A.

Given a QUESTION, the GROUND_TRUTH answer, and a MODEL_ANSWER, classify the model's answer as exactly one of:

- CORRECT: factually consistent with the ground truth. Numerical values may differ in formatting (e.g. $4.2B vs $4,234M) but must match in magnitude, period, and direction. Synonymous wording is fine.
- INCORRECT: contradicts the ground truth, gives a wrong number, wrong period, wrong subject, or invents facts not supported by the ground truth.
- REFUSED: the model declined to answer, said the information is not available, or asked for clarification, regardless of whether that refusal is warranted.

Reply with ONLY a single JSON object, no prose:
{"label": "CORRECT" | "INCORRECT" | "REFUSED", "rationale": "<one short sentence>"}
"""


@dataclass
class JudgeResult:
    label: str  # CORRECT / INCORRECT / REFUSED / ERROR
    rationale: str
    raw: str


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _parse_judge_output(raw: str) -> JudgeResult:
    body = _FENCE_RE.sub("", raw.strip())
    try:
        parsed = json.loads(body)
        label = str(parsed.get("label", "")).upper().strip()
        rationale = str(parsed.get("rationale", "")).strip()
        if label not in {"CORRECT", "INCORRECT", "REFUSED"}:
            label = "ERROR"
        return JudgeResult(label=label, rationale=rationale, raw=raw)
    except Exception:
        upper = raw.upper()
        for label in ("CORRECT", "INCORRECT", "REFUSED"):
            if label in upper:
                return JudgeResult(label=label, rationale=raw[:200], raw=raw)
        return JudgeResult(label="ERROR", rationale="unparseable judge response", raw=raw)


async def judge_answer(
    question: str,
    ground_truth: str,
    model_answer: str,
    judge_model: str | None = None,
) -> JudgeResult:
    judge_model = (
        judge_model
        or os.getenv("FINANCEBENCH_JUDGE_MODEL")
        or "gemini-3-flash-preview"
    )
    user = (
        f"QUESTION:\n{question}\n\n"
        f"GROUND_TRUTH:\n{ground_truth}\n\n"
        f"MODEL_ANSWER:\n{model_answer}\n"
    )
    try:
        llm = get_llm(judge_model)
        response = await llm.ainvoke(
            [SystemMessage(content=_JUDGE_SYSTEM), HumanMessage(content=user)]
        )
        raw = response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        return JudgeResult(label="ERROR", rationale=f"judge error: {e}", raw="")

    return _parse_judge_output(raw)
