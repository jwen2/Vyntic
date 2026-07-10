import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { extractFindingsFromRun } from "./extractFindingsFromRun";

function column(overrides: Partial<WorkflowColumn>): WorkflowColumn {
  return {
    id: "col-1",
    order_index: 0,
    label: "Hidden financial risks",
    prompt: "List hidden financial risks.",
    format: "text",
    is_derived: false,
    ...overrides,
  } as WorkflowColumn;
}

function cell(overrides: Partial<TabularCell>): TabularCell {
  return {
    id: "cell-1",
    run_id: "run-1",
    row_key: "doc-1",
    column_id: "col-1",
    status: "complete",
    answer: "",
    answer_formatted: null,
    citations: [],
    model: "test-model",
    fallback: false,
    duration_ms: 100,
    error_message: null,
    started_at: null,
    completed_at: null,
    ...overrides,
  } as TabularCell;
}

const QOE_CITATION: Citation = {
  source_file: "QoE Report.pdf",
  page: 23,
  text_snippet: "Customer A represents 78% of FY2023 revenue.",
};

describe("extractFindingsFromRun", () => {
  it("extracts findings with tagged severities, citations, and stable ids", () => {
    const cells = [
      cell({
        answer_formatted: {
          items: [
            { text: "[DEAL-BREAKER] Revenue concentration: one customer is 78% of revenue. [Source 1]" },
            { text: "[MATERIAL] Deferred maintenance capex appears understated." },
            { text: "Minor inventory count discrepancy noted in Q3." },
          ],
          ordered: false,
        },
        citations: [QOE_CITATION],
      }),
    ];
    const findings = extractFindingsFromRun(cells, [column({})]);

    expect(findings).toHaveLength(3);

    const [breaker, material, note] = findings;
    expect(breaker.sev).toBe("deal-breaker");
    expect(breaker.title).toBe("Revenue concentration: one customer is 78% of revenue.");
    expect(breaker.sourceCitation).toBe(QOE_CITATION);
    expect(breaker.src).toBe("QoE Report · p.23");
    expect(breaker.conf).toBe(86);
    expect(breaker.id).toMatch(/^scan-/);
    expect(breaker.origin).toBe("scan");
    expect(breaker.ws).toBe("proactive_scan");

    expect(material.sev).toBe("material");
    expect(material.sourceCitation).toBeNull();
    // Without a [Source N] marker the src falls back to the column label.
    expect(material.src).toBe("Hidden financial risks");
    expect(material.conf).toBe(68);

    expect(note.sev).toBe("noteworthy");
  });

  it("infers severity from keywords when no tag is present", () => {
    const cells = [
      cell({
        answer_formatted: {
          items: [
            "This is a deal-breaker: change-of-control clause voids the top contract.",
            "Significant risk of customer churn after transition.",
          ],
        },
      }),
    ];
    const findings = extractFindingsFromRun(cells, [column({})]);
    expect(findings.map((f) => f.sev)).toEqual(["deal-breaker", "material"]);
  });

  it("falls back to splitting the raw answer when answer_formatted is missing", () => {
    const cells = [
      cell({
        answer: "- First risk item.\n- Second risk item.",
        answer_formatted: null,
      }),
    ];
    const findings = extractFindingsFromRun(cells, [column({})]);
    expect(findings.map((f) => f.title)).toEqual(["First risk item.", "Second risk item."]);
  });

  it("skips incomplete cells, unknown columns, and non-finding columns", () => {
    const cells = [
      cell({ status: "queued", answer_formatted: { items: ["[MATERIAL] Ignored."] } }),
      cell({ column_id: "col-unknown", answer_formatted: { items: ["[MATERIAL] Ignored."] } }),
      cell({ column_id: "col-2", answer_formatted: { items: ["[MATERIAL] Ignored."] } }),
    ];
    const columns = [column({}), column({ id: "col-2", label: "Deal snapshot" })];
    expect(extractFindingsFromRun(cells, columns)).toEqual([]);
  });

  it("dedupes identical items across cells", () => {
    const item = { text: "[MATERIAL] Same finding repeated." };
    const cells = [
      cell({ answer_formatted: { items: [item] } }),
      cell({ id: "cell-2", row_key: "doc-2", answer_formatted: { items: [item] } }),
    ];
    expect(extractFindingsFromRun(cells, [column({})])).toHaveLength(1);
  });

  it("returns [] (not a throw) for malformed runs", () => {
    const cells = [
      cell({ answer_formatted: { unexpected: "shape" } as unknown as TabularCell["answer_formatted"] }),
      cell({ id: "cell-2", answer_formatted: "just a string" }),
      cell({ id: "cell-3", answer_formatted: { items: ["", "   "] } }),
    ];
    expect(extractFindingsFromRun(cells, [column({})])).toEqual([]);
    expect(extractFindingsFromRun([], [])).toEqual([]);
  });
});
