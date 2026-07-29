import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TabularCell } from "@/lib/workflows";
import type { CellShape } from "@/lib/cellShapes";
import type { Citation } from "@/lib/api";
import CellDetailBody from "./CellDetailBody";

const CITATION: Citation = {
  source_file: "Side Letter.pdf",
  page: 14,
  text_snippet: "Management fee of 2.00% of commitments.",
};

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
    citations: [CITATION],
    model: "test",
    fallback: false,
    duration_ms: 0,
    error_message: null,
    started_at: null,
    completed_at: null,
    ...overrides,
  } as TabularCell;
}

// vite.config.ts sets `globals: false`, so testing-library's automatic
// afterEach cleanup never registers — without this, renders accumulate and
// every getByText sees the previous test's DOM too.
afterEach(cleanup);

function renderBody(overrides: Partial<TabularCell>) {
  const onCitationClick = vi.fn();
  const target = cell(overrides);
  render(
    <CellDetailBody
      cell={target}
      citations={target.citations}
      activeCitId={null}
      onCitationClick={onCitationClick}
    />
  );
  return { onCitationClick };
}

const KV_SHAPE: CellShape = {
  kind: "kv",
  pairs: [
    {
      key: "Ongoing",
      value: "Management fee of 2.00% of commitments [Source 1]",
      unit: "percent",
    },
    { key: "One-time", value: "Organizational expenses capped at $1.25 million", unit: "USD" },
  ],
};

describe("CellDetailBody", () => {
  it("renders a kv cell as labelled fields, not as JSON or prose", () => {
    renderBody({
      answer: JSON.stringify({ pairs: [] }),
      answer_formatted: KV_SHAPE,
      answer_display: "- Ongoing: …",
    });

    // Keys become field labels of their own.
    expect(screen.getByText("Ongoing")).toBeDefined();
    expect(screen.getByText("One-time")).toBeDefined();
    // The reported regression: the raw JSON payload must never appear.
    expect(screen.queryByText(/"pairs"/)).toBeNull();
    // The unit is dropped where the value already conveys it, kept otherwise.
    expect(screen.queryByText(/percent/)).toBeNull();
  });

  it("turns a preserved [Source N] marker into a clickable citation chip", () => {
    const { onCitationClick } = renderBody({ answer_formatted: KV_SHAPE });

    // AnswerText renders the marker as an interactive chip, not as the literal
    // text "[Source 1]" — so the pair carries its own source anchor.
    expect(screen.queryByText(/\[Source 1\]/)).toBeNull();
    const chips = screen.getAllByRole("button");
    expect(chips.length).toBeGreaterThan(0);
    chips[0].click();
    expect(onCitationClick).toHaveBeenCalled();
  });

  it("renders a list cell as indexed rows", () => {
    renderBody({
      answer_formatted: {
        kind: "list",
        ordered: true,
        items: [{ text: "Drop-dead date" }, { text: "HSR failure" }],
      },
    });

    expect(screen.getByText("1.")).toBeDefined();
    expect(screen.getByText("2.")).toBeDefined();
    expect(screen.getByText("Drop-dead date")).toBeDefined();
  });

  it("falls back to the single cited body for prose and shapeless cells", () => {
    renderBody({
      answer_formatted: { kind: "prose", summary: "S.", body: "The full body.", caveats: [] },
      answer_display: "The full body.",
    });

    expect(screen.getByText("The full body.")).toBeDefined();
  });

  it("renders shapeless cells from the raw answer", () => {
    renderBody({ answer: "Plain text answer.", answer_display: "Plain text answer." });

    expect(screen.getByText("Plain text answer.")).toBeDefined();
  });

  it("shows the empty state rather than an empty panel", () => {
    renderBody({});

    expect(screen.getByText("No answer captured for this cell yet.")).toBeDefined();
  });

  it("does not render an empty typed panel when a shape has no rows", () => {
    renderBody({ answer_formatted: { kind: "kv", pairs: [] }, answer: "Nothing extracted." });

    // An empty kv shape must degrade to the body, not render a bare card.
    expect(screen.getByText("Nothing extracted.")).toBeDefined();
  });
});
