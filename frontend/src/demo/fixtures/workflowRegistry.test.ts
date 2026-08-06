import { describe, it, expect } from "vitest";
import {
  DEMO_CATALOGUE,
  DEMO_RECORDINGS,
  RECORDING_BY_RUN,
  RECORDING_BY_WORKFLOW,
} from "./workflowRegistry";
import { UNRECORDED_REFUSALS } from "./workflows";
import { DEMO_DOCS_BY_FILENAME, DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import { asShape } from "@/lib/cellShapes";
import type { WorkflowRun } from "@/lib/workflows";

describe("the recorded catalogue", () => {
  it("holds the eight LP built-ins the backend seeds for fund workspaces", () => {
    expect(DEMO_CATALOGUE).toHaveLength(8);
    for (const w of DEMO_CATALOGUE) {
      expect(w.entity_type, w.name).toBe("fund");
      expect(w.is_builtin, w.name).toBe(true);
      expect(w.deal_id, w.name).toBeNull();
    }
    expect(new Set(DEMO_CATALOGUE.map((w) => w.id)).size).toBe(8);
  });

  /**
   * The guard the spec exists for. A ninth built-in appearing in
   * workflow_seed_lp.py and landing in a re-recorded catalogue must fail here,
   * rather than shipping as a button that does nothing a prospect can read.
   */
  it("resolves every built-in to either a recording or a refusal", () => {
    for (const w of DEMO_CATALOGUE) {
      const recorded = RECORDING_BY_WORKFLOW.has(w.id);
      const refused = typeof UNRECORDED_REFUSALS[w.id] === "string";
      expect(
        recorded !== refused,
        `${w.name} (${w.id}) is ${recorded && refused ? "both recorded and refused" : "neither recorded nor refused"}`
      ).toBe(true);
    }
  });

  it("refuses only workflows that are actually in the catalogue", () => {
    const ids = new Set(DEMO_CATALOGUE.map((w) => w.id));
    for (const id of Object.keys(UNRECORDED_REFUSALS)) {
      expect(ids.has(id), `refusal for unknown workflow ${id}`).toBe(true);
    }
  });

  it("indexes each recording by both its workflow and its run", () => {
    expect(RECORDING_BY_WORKFLOW.size).toBe(DEMO_RECORDINGS.length);
    expect(RECORDING_BY_RUN.size).toBe(DEMO_RECORDINGS.length);
    for (const rec of DEMO_RECORDINGS) {
      expect(RECORDING_BY_WORKFLOW.get(rec.workflowId)).toBe(rec);
      expect(RECORDING_BY_RUN.get(rec.run.id)).toBe(rec);
      expect([DEMO_FUND_IV_ID, DEMO_FUND_III_ID]).toContain(rec.dealId);
    }
  });
});

/**
 * The recordings are the one place a JSON import crosses into typed code, and
 * those casts are claims rather than checks. These walkers are the checks, and
 * they run over every recording — so a re-recording that drops a field or cites
 * a page that does not exist fails here rather than blanking a surface in front
 * of a prospect.
 */
function assertRunShape(run: WorkflowRun, where: string): void {
  expect(typeof run.id, where).toBe("string");
  expect(typeof run.workflow_id, where).toBe("string");
  expect(typeof run.deal_id, where).toBe("string");
  expect(typeof run.run_number, where).toBe("number");
  expect(run.status, where).toBe("complete");
  expect(Array.isArray(run.document_ids), where).toBe(true);
  for (const id of run.document_ids) expect(typeof id, where).toBe("string");
  expect(run.started_by === null || typeof run.started_by === "number", where).toBe(true);
  expect(typeof run.started_at, where).toBe("string");
  expect(typeof run.completed_at, where).toBe("string");
  expect(Array.isArray(run.cells), where).toBe(true);
  expect(Array.isArray(run.stage_outputs), where).toBe(true);

  for (const cell of run.cells) {
    const at = `${where} cell ${cell.id}`;
    expect(typeof cell.id, at).toBe("string");
    expect(typeof cell.run_id, at).toBe("string");
    expect(typeof cell.row_key, at).toBe("string");
    expect(typeof cell.column_id, at).toBe("string");
    expect(cell.status, at).toBe("complete");
    expect(cell.error_message, at).toBeNull();
    expect(typeof cell.answer, at).toBe("string");
    expect(cell.answer_display.length, at).toBeGreaterThan(0);
    expect(
      cell.answer_formatted === null || asShape(cell.answer_formatted) !== null,
      `${at} answer_formatted is neither null nor a tagged shape`
    ).toBe(true);
    expect(Array.isArray(cell.citations), at).toBe(true);
    expect(typeof cell.model, at).toBe("string");
    expect(typeof cell.fallback, at).toBe("boolean");
    expect(typeof cell.duration_ms, at).toBe("number");
    expect(typeof cell.started_at, at).toBe("string");
    expect(typeof cell.completed_at, at).toBe("string");

    for (const cite of cell.citations) {
      if (cite === null) continue;
      expect(typeof cite.source_file, at).toBe("string");
      expect(typeof cite.page, at).toBe("number");
      expect(typeof cite.text_snippet, at).toBe("string");
      expect(typeof cite.deal_id, at).toBe("string");
      expect(["extracted", "derived"], at).toContain(cite.kind);
      expect("span_label" in cite, at).toBe(true);
      expect(cite.span_label === null || typeof cite.span_label === "string", at).toBe(true);
    }
  }
}

describe.each(DEMO_RECORDINGS.map((r) => [r.workflow.name, r] as const))(
  "recording: %s",
  (name, rec) => {
    it("matches the real API shape at runtime, field by field", () => {
      assertRunShape(rec.run, name);
    });

    it("cites only real corpus files at pages inside those files", () => {
      let cited = 0;
      for (const cell of rec.run.cells) {
        for (const cite of cell.citations.filter(Boolean)) {
          cited += 1;
          const doc = DEMO_DOCS_BY_FILENAME[cite!.source_file];
          expect(doc, `unknown source_file ${cite!.source_file}`).toBeDefined();
          expect(doc.deal_id, `${cite!.source_file} belongs to another fund`).toBe(rec.dealId);
          if (cite!.source_file.endsWith(".xlsx")) {
            // Spreadsheets have no pages; page 0 is the sheet-level convention.
            expect(cite!.page, cite!.source_file).toBe(0);
          } else {
            expect(cite!.page, cite!.source_file).toBeGreaterThan(0);
            expect(cite!.page, cite!.source_file).toBeLessThanOrEqual(doc.page_count);
          }
        }
      }
      // Every recording must actually cite something, or it is prose.
      expect(cited, name).toBeGreaterThan(0);
    });

    it("runs against documents that exist in its own fund's corpus", () => {
      const own = new Set(
        Object.values(DEMO_DOCS_BY_FILENAME)
          .filter((d) => d.deal_id === rec.dealId)
          .map((d) => d.doc_id)
      );
      for (const id of rec.run.document_ids) {
        expect(own.has(id), `${name}: unknown document_id ${id}`).toBe(true);
      }
    });

    it("covers every one of its workflow's columns, in every row", () => {
      const columnIds = rec.workflow.columns.map((c) => c.id);
      expect(rec.run.cells).toHaveLength(columnIds.length * rec.rows.length);
      for (const row of rec.rows) {
        const inRow = rec.run.cells.filter((c) => c.row_key === row).map((c) => c.column_id);
        expect(inRow, `${name} / ${row}`).toEqual(columnIds);
      }
    });
  }
);
