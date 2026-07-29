import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import type { CellShape } from "@/lib/cellShapes";
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
    answer_display: "",
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

const LIST_ONE_ITEM: CellShape = {
  kind: "list",
  ordered: false,
  items: [{ text: "[MATERIAL] Ignored." }],
};

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
          kind: "list",
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

  it("maps the [Source N] marker to a citation, then hides it from the text", () => {
    // The backend preserves markers in list shapes precisely so this lookup
    // works; it used to strip them, so every finding silently fell back to the
    // column label with confidence 68 instead of a real doc + page.
    const findings = extractFindingsFromRun(
      [
        cell({
          answer_formatted: {
            kind: "list",
            ordered: false,
            items: [{ text: "[MATERIAL] Working capital peg is unfunded. [Source 1]" }],
          },
          citations: [QOE_CITATION],
        }),
      ],
      [column({})]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].sourceCitation).toBe(QOE_CITATION);
    expect(findings[0].conf).toBe(86);
    // The marker did its job and must not leak into what the analyst reads.
    expect(findings[0].title).toBe("Working capital peg is unfunded.");
    expect(findings[0].detail).not.toMatch(/\[Source/);
  });

  it("infers severity from keywords when no tag is present", () => {
    const cells = [
      cell({
        answer_formatted: {
          kind: "list",
          ordered: false,
          items: [
            { text: "This is a deal-breaker: change-of-control clause voids the top contract." },
            { text: "Significant risk of customer churn after transition." },
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
      cell({ status: "queued", answer_formatted: LIST_ONE_ITEM }),
      cell({ column_id: "col-unknown", answer_formatted: LIST_ONE_ITEM }),
      cell({ column_id: "col-2", answer_formatted: LIST_ONE_ITEM }),
    ];
    const columns = [column({}), column({ id: "col-2", label: "Deal snapshot" })];
    expect(extractFindingsFromRun(cells, columns)).toEqual([]);
  });

  it("dedupes identical items across cells", () => {
    const item = { text: "[MATERIAL] Same finding repeated." };
    const cells = [
      cell({ answer_formatted: { kind: "list", ordered: false, items: [item] } }),
      cell({ id: "cell-2", row_key: "doc-2", answer_formatted: { kind: "list", ordered: false, items: [item] } }),
    ];
    expect(extractFindingsFromRun(cells, [column({})])).toHaveLength(1);
  });

  it("returns [] (not a throw) for malformed runs", () => {
    const cells = [
      // Untagged / unknown payloads never narrow to a shape, so the extractor
      // falls back to the (empty) raw answer instead of throwing.
      cell({ answer_formatted: { unexpected: "shape" } as unknown as TabularCell["answer_formatted"] }),
      cell({ id: "cell-2", answer_formatted: "just a string" as unknown as TabularCell["answer_formatted"] }),
      cell({ id: "cell-3", answer_formatted: { kind: "list", ordered: false, items: [{ text: "" }, { text: "   " }] } }),
    ];
    expect(extractFindingsFromRun(cells, [column({})])).toEqual([]);
    expect(extractFindingsFromRun([], [])).toEqual([]);
  });
});
