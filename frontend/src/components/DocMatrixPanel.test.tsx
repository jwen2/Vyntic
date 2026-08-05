import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DocumentMetadata } from "@/lib/api";
import { disableDemoMode, enableDemoMode } from "@/demo/mode";
import DocMatrixPanel from "./DocMatrixPanel";

const DEAL_ID = "brightwater_iv";

const documents: DocumentMetadata[] = [
  {
    doc_id: "brightwater_iv_272f20ae",
    deal_id: DEAL_ID,
    filename: "brightwater_iv_lpa.pdf",
    page_count: 20,
    chunk_count: 38,
    doc_category: "lpa",
    period: null,
    scope: "entity",
  },
  {
    doc_id: "brightwater_iv_17662bde",
    deal_id: DEAL_ID,
    filename: "brightwater_iv_ddq.pdf",
    page_count: 20,
    chunk_count: 27,
    doc_category: "ddq",
    period: null,
    scope: "entity",
  },
];

function renderPanel() {
  render(
    <DocMatrixPanel
      dealId={DEAL_ID}
      documents={documents}
      onViewDocument={vi.fn()}
      onDeleteDocument={vi.fn()}
    />
  );
}

const ASK_LABEL = "Ask a question across all documents";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  disableDemoMode();
  localStorage.clear();
});

describe("DocMatrixPanel outside demo mode", () => {
  it("offers the ask box and the preset chips", () => {
    renderPanel();
    expect(screen.getByLabelText(ASK_LABEL)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask" })).toBeTruthy();
  });
});

describe("DocMatrixPanel in demo mode", () => {
  it("removes every control that would open a doc-matrix stream", () => {
    enableDemoMode();
    renderPanel();

    expect(screen.queryByLabelText(ASK_LABEL)).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add column" })).toBeNull();
  });

  it("explains the gap and points at the surfaces that do carry recorded work", () => {
    enableDemoMode();
    renderPanel();

    expect(screen.getByText(/runs a fresh model query per document/)).toBeTruthy();
    expect(screen.getByText("Analyze")).toBeTruthy();
    expect(screen.getByText("Agent")).toBeTruthy();
    expect(screen.getByText("Workflows")).toBeTruthy();
  });

  it("still names the documents the workspace holds", () => {
    enableDemoMode();
    renderPanel();

    expect(screen.getByText("brightwater_iv_lpa.pdf")).toBeTruthy();
    expect(screen.getByText(/2 documents/)).toBeTruthy();
  });

  // useDocMatrix restores columns and cells from localStorage. A visitor who
  // used the real app in this browser would otherwise get the live grid back —
  // ask bar, per-cell Retry — inside the demo.
  it("does not restore the live grid from a previous real session", () => {
    localStorage.setItem(
      `vyntic_doc_matrix_${DEAL_ID}`,
      JSON.stringify({
        columns: [{ id: "col1", label: "Revenue", prompt: "What was revenue?", format: "text" }],
        cells: {
          brightwater_iv_272f20ae: {
            col1: { answer: "£12m", citations: [], status: "complete" },
          },
        },
      })
    );
    enableDemoMode();
    renderPanel();

    expect(screen.queryByRole("button", { name: "Add column" })).toBeNull();
    expect(screen.queryByText("£12m")).toBeNull();
    expect(screen.getByText(/runs a fresh model query per document/)).toBeTruthy();
  });
});
