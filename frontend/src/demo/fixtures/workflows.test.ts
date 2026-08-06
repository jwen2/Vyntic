import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "@/demo/transport";
import { ApiError } from "@/lib/api";
import {
  cloneWorkflow,
  downloadRunExport,
  retryCell,
  startWorkflowRun,
} from "@/lib/workflows";
import { disableDemoMode, enableDemoMode } from "@/demo/mode";
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
      // `deal_id`, `kind` and `span_label` are optional in `Citation`
      // (lib/api.ts:403-410) and every read site has a fallback, so dropping
      // them degrades quietly rather than throwing: `deal_id` routes the doc
      // viewer (useTabularRun.ts:159), `kind` and `span_label` render the
      // citation chip's label and colour (CellRenderer.tsx:327,333). The
      // recording carries all three on all 59 citations — assert them so a
      // re-recording that stops emitting them fails here.
      expect(typeof cite.deal_id, where).toBe("string");
      expect(["extracted", "derived"], where).toContain(cite.kind);
      // Legitimately null throughout this recording — no citation spans a
      // labelled range — so assert the key exists and is correctly typed
      // rather than that it holds a value.
      expect("span_label" in cite, where).toBe(true);
      expect(cite.span_label === null || typeof cite.span_label === "string", where).toBe(
        true
      );
    }
  }
}

/**
 * The built-in's real column ids paired with their real labels, transcribed
 * from the seeded database dump in
 * `.superpowers/sdd/2026-08-03-demo-mode-odd/corpus-ground-truth.md`
 * ("DDQ Gap & Consistency Scan — real IDs").
 *
 * This golden exists because nothing else pins the pairing. The ordering test
 * compares cell `column_id`s against workflow `column.id`s and is label-blind:
 * swap two labels while leaving the ids in place and every other test still
 * passes, while the demo silently files each recorded answer under the wrong
 * DDQ section.
 *
 * Per CLAUDE.md invariant 4, built-in column ids are stable across startup
 * reconciliation, so this table is a fact about the backend rather than a
 * snapshot of the fixture. A failure therefore means one of exactly two
 * things: `workflow_seed_lp.py` really renamed or reordered a column, in which
 * case update this table deliberately from a fresh read of the seeded DB; or
 * someone edited `workflows.ts` carelessly, in which case revert the edit.
 */
const DDQ_COLUMN_GOLDEN: ReadonlyArray<{
  order_index: number;
  id: string;
  label: string;
}> = [
  { order_index: 1, id: "4223f1f6938a46b9aa0be66a6044bf05", label: "Firm & Ownership" },
  { order_index: 2, id: "68558a7e665548a28536c1b7f2a13314", label: "Team & Succession" },
  { order_index: 3, id: "ef3ececba4894d829463c407cb2cd156", label: "Track Record" },
  {
    order_index: 4,
    id: "dd0188ff630d467d9941ccf80d34a740",
    label: "Investment Strategy & Process",
  },
  { order_index: 5, id: "a01ad37a06444c348b93de7cecd96e5f", label: "Fund Terms & Economics" },
  { order_index: 6, id: "9814f84441844e788e44523b2002848c", label: "Valuation Policy" },
  { order_index: 7, id: "9f181791b2a247a59135123e8b7de3d0", label: "Compliance & Regulatory" },
  { order_index: 8, id: "b778bec0d4c84fb6b3ecc85a1c24f3fb", label: "IT & Cybersecurity" },
  { order_index: 9, id: "f9b31fbd5a8842e0b1f339e5a456c7bd", label: "ESG" },
  { order_index: 10, id: "8495ea4a16a74d1ca73fe891d5a8f9e5", label: "LP Base & References" },
  { order_index: 11, id: "1b2486ce7b1b4480b5c2af0913241e38", label: "Conflicts of Interest" },
  { order_index: 12, id: "634bbe4f41a84ce0b63d01a9b26bdbda", label: "Service Providers" },
];

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

  it("pairs every column id with the label the database gave it", () => {
    expect(
      DEMO_DDQ_WORKFLOW.columns.map((c) => ({
        order_index: c.order_index,
        id: c.id,
        label: c.label,
      }))
    ).toEqual(DDQ_COLUMN_GOLDEN);
  });

  it("builds each column prompt around the upper-cased section name", () => {
    const firm = DEMO_DDQ_WORKFLOW.columns[0];
    expect(firm.label).toBe("Firm & Ownership");
    // Was pinning a transcribed `columnPrompt()` helper; now it pins the real
    // seeded prompt (workflow_seed_lp.py:26), which upper-cases the whole
    // section name. An `&` label proves it is the whole name, not just the
    // first word.
    expect(firm.prompt).toContain("FIRM & OWNERSHIP");
    expect(firm.prompt).not.toContain("Firm & Ownership");
    for (const column of DEMO_DDQ_WORKFLOW.columns) {
      expect(column.prompt, column.label).toContain(column.label.toUpperCase());
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

/**
 * Driven through `lib/workflows.ts` rather than `demoFetch`, so the assertion
 * is what a visitor's click produces: `requestRaw` turns the 403 into an
 * `ApiError` carrying the detail, which is the string every panel renders.
 */
describe("writes around the recorded run", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerWorkflowFixtures();
    enableDemoMode();
  });

  afterEach(() => {
    disableDemoMode();
    resetDemoRoutes();
  });

  const GENERIC = "Not available in demo";

  it("refuses a cell rerun, saying the answers are fixed and still cited", async () => {
    const err = await retryCell(DEMO_DDQ_RUN.id, "cell_a").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).not.toBe(GENERIC);
    expect(err.message).toContain("cited");
  });

  it("refuses the Excel export, saying there is no backend to build it", async () => {
    const err = await downloadRunExport(DEMO_DDQ_RUN.id, "xlsx").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain("server-side");
  });

  it("refuses cloning the built-in workflow", async () => {
    const err = await cloneWorkflow(DEMO_FUND_IV_ID, DEMO_DDQ_WORKFLOW.id).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toBe(GENERIC);
  });

  // Starting a run must NOT be refused — it arms the replay that is the demo's
  // centrepiece. This is the one POST on this surface that still answers.
  it("still starts a run, because that is what replays the recording", async () => {
    const started = await startWorkflowRun(DEMO_FUND_IV_ID, DEMO_DDQ_WORKFLOW.id, []);
    expect(started.id).toBe(DEMO_DDQ_RUN.id);
  });
});
