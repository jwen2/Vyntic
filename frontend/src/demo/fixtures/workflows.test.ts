import { describe, it, expect, beforeEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "@/demo/transport";
import {
  registerWorkflowFixtures,
  DEMO_DDQ_RUN,
  DEMO_DDQ_WORKFLOW,
  DEMO_DDQ_ROWS,
} from "./workflows";
import { DEMO_DOCS_BY_FILENAME, DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import { asShape } from "@/lib/cellShapes";
import type { WorkflowRun } from "@/lib/workflows";

/**
 * The recorded run is the one place a JSON import crosses into typed code, so
 * `DEMO_DDQ_RUN` is the only permitted `as unknown as` in the demo fixtures.
 * That cast is a claim, not a check — this walker is the check. It asserts, at
 * runtime, that every field the app reads off a run/cell/citation is present
 * with the right type, so a re-recording that drops or renames a field fails
 * here rather than blanking a surface in front of a prospect.
 */
function assertRunShape(run: WorkflowRun): void {
  expect(typeof run.id).toBe("string");
  expect(typeof run.workflow_id).toBe("string");
  expect(typeof run.deal_id).toBe("string");
  expect(typeof run.run_number).toBe("number");
  expect(["pending", "running", "checkpoint", "complete", "cancelled", "error"]).toContain(
    run.status
  );
  expect(Array.isArray(run.document_ids)).toBe(true);
  for (const id of run.document_ids) expect(typeof id).toBe("string");
  expect(run.started_by === null || typeof run.started_by === "number").toBe(true);
  expect(typeof run.started_at).toBe("string");
  expect(run.completed_at === null || typeof run.completed_at === "string").toBe(true);
  expect(Array.isArray(run.cells)).toBe(true);
  expect(Array.isArray(run.stage_outputs)).toBe(true);

  for (const cell of run.cells) {
    const where = `cell ${cell.id}`;
    expect(typeof cell.id, where).toBe("string");
    expect(typeof cell.run_id, where).toBe("string");
    expect(typeof cell.row_key, where).toBe("string");
    expect(typeof cell.column_id, where).toBe("string");
    expect(["queued", "running", "complete", "error"], where).toContain(cell.status);
    expect(typeof cell.answer, where).toBe("string");
    expect(typeof cell.answer_display, where).toBe("string");
    // Kind-tagged contract: null, or a shape `asShape` recognises. Never
    // inspected by key (lib/cellShapes.ts).
    expect(
      cell.answer_formatted === null || asShape(cell.answer_formatted) !== null,
      `${where} answer_formatted is neither null nor a tagged shape`
    ).toBe(true);
    expect(Array.isArray(cell.citations), where).toBe(true);
    expect(
      cell.quality === null || cell.quality === undefined || typeof cell.quality === "object",
      where
    ).toBe(true);
    expect(typeof cell.model, where).toBe("string");
    expect(typeof cell.fallback, where).toBe("boolean");
    expect(typeof cell.duration_ms, where).toBe("number");
    expect(cell.error_message === null || typeof cell.error_message === "string", where).toBe(
      true
    );
    expect(cell.started_at === null || typeof cell.started_at === "string", where).toBe(true);
    expect(cell.completed_at === null || typeof cell.completed_at === "string", where).toBe(
      true
    );

    for (const cite of cell.citations) {
      // Sparse by construction: the array is indexed by source number, so
      // uncited slots are null.
      if (cite === null) continue;
      expect(typeof cite.source_file, where).toBe("string");
      expect(typeof cite.page, where).toBe("number");
      expect(typeof cite.text_snippet, where).toBe("string");
    }
  }
}

describe("workflow fixtures", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerWorkflowFixtures();
  });

  it("exposes the DDQ Gap & Consistency Scan with 12 markdown columns", () => {
    expect(DEMO_DDQ_WORKFLOW.id).toBe("builtin_lp_ddq_scan");
    expect(DEMO_DDQ_WORKFLOW.name).toBe("DDQ Gap & Consistency Scan");
    expect(DEMO_DDQ_WORKFLOW.entity_type).toBe("fund");
    expect(DEMO_DDQ_WORKFLOW.row_source).toBe("multi_doc_synthesis");
    expect(DEMO_DDQ_WORKFLOW.is_builtin).toBe(true);
    expect(DEMO_DDQ_WORKFLOW.columns).toHaveLength(12);
    // This workflow has no enum column, so the demo stages no
    // Clean/Monitor/Red flag badge — the risk language lives in the prose.
    for (const column of DEMO_DDQ_WORKFLOW.columns) {
      expect(column.format, column.label).toBe("markdown");
      expect(column.tags, column.label).toBeNull();
    }
  });

  it("records exactly 1 row x 12 columns = 12 cells", () => {
    expect(DEMO_DDQ_ROWS).toEqual(["DDQ Gap & Consistency Scan"]);
    expect(DEMO_DDQ_RUN.cells).toHaveLength(12);
    for (const cell of DEMO_DDQ_RUN.cells) {
      expect(cell.row_key).toBe(DEMO_DDQ_ROWS[0]);
    }
  });

  it("emits every cell against a declared column, in column order", () => {
    expect(DEMO_DDQ_RUN.cells.map((c) => c.column_id)).toEqual(
      DEMO_DDQ_WORKFLOW.columns.map((c) => c.id)
    );
    expect(DEMO_DDQ_RUN.workflow_id).toBe(DEMO_DDQ_WORKFLOW.id);
    expect(DEMO_DDQ_RUN.deal_id).toBe(DEMO_FUND_IV_ID);
  });

  it("has every cell complete, populated, and error-free", () => {
    expect(DEMO_DDQ_RUN.status).toBe("complete");
    for (const cell of DEMO_DDQ_RUN.cells) {
      expect(cell.status).toBe("complete");
      expect(cell.error_message).toBeNull();
      expect(cell.answer_display.length).toBeGreaterThan(0);
    }
  });

  it("matches the real API shape at runtime, field by field", () => {
    assertRunShape(DEMO_DDQ_RUN);
  });

  it("cites only real corpus files at pages inside those files", () => {
    let cited = 0;
    for (const cell of DEMO_DDQ_RUN.cells) {
      for (const cite of cell.citations.filter(Boolean)) {
        cited += 1;
        const doc = DEMO_DOCS_BY_FILENAME[cite!.source_file];
        expect(doc, `unknown source_file ${cite!.source_file}`).toBeDefined();
        if (cite!.source_file.endsWith(".xlsx")) {
          // Spreadsheets have no pages; page 0 is the sheet-level convention.
          expect(cite!.page, cite!.source_file).toBe(0);
        } else {
          expect(cite!.page, cite!.source_file).toBeGreaterThan(0);
          expect(cite!.page, cite!.source_file).toBeLessThanOrEqual(doc.page_count);
        }
      }
    }
    expect(cited).toBe(59);
  });

  it("runs against documents that exist in the fund's corpus", () => {
    const docIds = new Set(
      Object.values(DEMO_DOCS_BY_FILENAME).map((d) => d.doc_id)
    );
    for (const id of DEMO_DDQ_RUN.document_ids) {
      expect(docIds.has(id), `unknown document_id ${id}`).toBe(true);
    }
  });

  it("serves the workflow list, the workflow, and the run over the fixture transport", async () => {
    const list = await (await demoFetch(`/api/deals/${DEMO_FUND_IV_ID}/workflows`, {
      method: "GET",
    })!).json();
    expect(list.some((w: { name: string }) => w.name === "DDQ Gap & Consistency Scan")).toBe(
      true
    );

    const workflow = await (await demoFetch(
      `/api/deals/${DEMO_FUND_IV_ID}/workflows/${DEMO_DDQ_WORKFLOW.id}`,
      { method: "GET" }
    )!).json();
    expect(workflow.columns).toHaveLength(12);

    const run = await (await demoFetch(`/api/runs/${DEMO_DDQ_RUN.id}`, {
      method: "GET",
    })!).json();
    expect(run.cells).toHaveLength(12);
  });

  it("shows the recorded run as history on Fund IV only", async () => {
    const ivRuns = await (await demoFetch(
      `/api/deals/${DEMO_FUND_IV_ID}/workflows/${DEMO_DDQ_WORKFLOW.id}/runs`,
      { method: "GET" }
    )!).json();
    expect(ivRuns).toHaveLength(1);
    expect(ivRuns[0].id).toBe(DEMO_DDQ_RUN.id);

    const iiiRuns = await (await demoFetch(
      `/api/deals/${DEMO_FUND_III_ID}/workflows/${DEMO_DDQ_WORKFLOW.id}/runs`,
      { method: "GET" }
    )!).json();
    expect(iiiRuns).toEqual([]);
  });
});
