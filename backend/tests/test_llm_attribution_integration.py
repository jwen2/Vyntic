"""Attribution must survive the real code path, not just a direct
`llm_call_context` call in a test.

Why this file exists: `test_llm_metrics_store.py::test_surface_vocabulary_is_used_in_source`
greps `app/` for surface labels, and `test_llm_token_accounting.py` opens the
context manager itself. Both pass even if a production `with llm_call_context(...)`
block is scoped too narrowly to actually enclose the LLM call — the row would
then land with `surface="unknown"` and `deal_id=NULL`, and `summarize()` filters
on `deal_id`, so it would be invisible to every read path rather than visibly
wrong. Only driving a real caller catches that.

The fake is placed at the narrowest possible seam — `llm.get_llm`, i.e. the
network boundary — so `execute_cell` -> `run_extraction` ->
`stream_with_fallback` -> `_record` all run for real.
"""
import json
from types import SimpleNamespace

from app.agents import llm
from app.database import (
    DealRow,
    LLMCallRow,
    SessionLocal,
    TabularCellRow,
    WorkflowColumnRow,
    WorkflowRow,
    WorkflowRunRow,
)
from app.services import workflow_run_executor

DEAL_ID = "attr_deal"
RUN_ID = "attr_run"
CELL_ID = "attr_run_cell"
DOC_ID = "attr_doc"


class _FakeLLM:
    """Stands in for ChatGoogleGenerativeAI at the astream boundary."""

    async def astream(self, messages):
        yield SimpleNamespace(
            content="Revenue was $10m [Source 1].",
            usage_metadata={"input_tokens": 1234, "output_tokens": 9},
        )


def _seed() -> None:
    db = SessionLocal()
    try:
        db.add(DealRow(deal_id=DEAL_ID, name="Attribution Deal"))
        db.add(WorkflowRow(id="attr_wf", deal_id=DEAL_ID, name="WF", type="tabular"))
        db.flush()
        db.add(
            WorkflowColumnRow(
                id="attr_col",
                workflow_id="attr_wf",
                order_index=1,
                label="Revenue",
                prompt="What was revenue?",
            )
        )
        db.add(
            WorkflowRunRow(
                id=RUN_ID,
                workflow_id="attr_wf",
                deal_id=DEAL_ID,
                run_number=1,
                status="running",
                document_ids_json=json.dumps([DOC_ID]),
            )
        )
        db.flush()
        db.add(
            TabularCellRow(
                id=CELL_ID,
                run_id=RUN_ID,
                row_key=DOC_ID,  # one_doc_per_row: row_key IS the doc_id
                column_id="attr_col",
                status="queued",
            )
        )
        db.commit()
    finally:
        db.close()


def _llm_call_rows() -> list[LLMCallRow]:
    db = SessionLocal()
    try:
        return db.query(LLMCallRow).all()
    finally:
        db.close()


async def test_execute_cell_records_a_fully_attributed_row(monkeypatch, clear_store):
    _seed()

    chunks = [{"source_file": "report.pdf", "page": 4, "content": "Revenue: $10m"}]

    async def _load_doc_context(deal_id, doc_id, query):
        return chunks

    monkeypatch.setattr(workflow_run_executor, "ensure_llm_configured", lambda: None)
    monkeypatch.setattr(
        workflow_run_executor, "load_doc_context", _load_doc_context
    )
    monkeypatch.setattr(
        workflow_run_executor, "get_doc_page_chunks", lambda deal_id, doc_id: chunks
    )
    monkeypatch.setattr(llm, "get_llm", lambda model=None: _FakeLLM())

    await workflow_run_executor.execute_cell(CELL_ID, RUN_ID, DEAL_ID)

    rows = _llm_call_rows()
    assert len(rows) == 1, "the real cell path must write exactly one metrics row"
    row = rows[0]
    assert row.surface == "tabular_cell"
    assert row.deal_id == DEAL_ID
    assert row.run_id == RUN_ID
    assert row.cell_id == CELL_ID
    assert row.doc_id == DOC_ID
    assert row.outcome == "ok"
    assert row.prompt_tokens == 1234
    assert row.completion_tokens == 9
