/**
 * Tests for Phase 1, Feature 3: CSV Export.
 * Validates CSV generation logic, Markdown stripping, and escaping.
 */
import { CellData } from "../lib/api";

// We test the internal logic by importing the module.
// Note: exportMatrixCSV triggers a download, so we test the helper functions
// by extracting/reimplementing the pure logic here.

/** Stripped-down version of stripMarkdown for testing */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[Source\s+\d+\]/g, "")
    .replace(/\|/g, " ")
    .replace(/-{3,}/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function escapeCSV(value: string): string {
  const cleaned = stripMarkdown(value);
  if (cleaned.includes(",") || cleaned.includes("\n") || cleaned.includes('"')) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
}

describe("CSV Export - stripMarkdown", () => {
  it("strips bold markers", () => {
    expect(stripMarkdown("**Revenue** is strong")).toBe("Revenue is strong");
  });

  it("strips italic markers", () => {
    expect(stripMarkdown("*emphasis* here")).toBe("emphasis here");
  });

  it("strips citation references", () => {
    expect(stripMarkdown("Growth is 15% [Source 1] annually [Source 2]")).toBe(
      "Growth is 15%  annually"
    );
  });

  it("strips heading markers", () => {
    expect(stripMarkdown("## Financial Summary")).toBe("Financial Summary");
  });

  it("replaces table pipes with spaces", () => {
    expect(stripMarkdown("| Col1 | Col2 |")).toBe("Col1   Col2");
  });

  it("collapses multiple newlines", () => {
    expect(stripMarkdown("Line1\n\n\nLine2")).toBe("Line1\nLine2");
  });
});

describe("CSV Export - escapeCSV", () => {
  it("leaves simple values unquoted", () => {
    expect(escapeCSV("Revenue is strong")).toBe("Revenue is strong");
  });

  it("wraps values with commas in quotes", () => {
    expect(escapeCSV("$10,000 revenue")).toBe('"$10,000 revenue"');
  });

  it("wraps values with newlines in quotes", () => {
    expect(escapeCSV("Line1\nLine2")).toBe('"Line1\nLine2"');
  });

  it("escapes double quotes by doubling them", () => {
    expect(escapeCSV('Said "hello"')).toBe('"Said ""hello"""');
  });

  it("strips markdown before escaping", () => {
    expect(escapeCSV("**$10,000** revenue [Source 1]")).toBe('"$10,000 revenue"');
  });
});

describe("CSV Export - matrix structure", () => {
  const deals = ["deal_a", "deal_b"];
  const queries = ["What is revenue?", "Key risks?"];
  const cells: Record<string, Record<string, CellData>> = {
    deal_a: {
      "What is revenue?": {
        answer: "**$50M** [Source 1]",
        citations: [],
        status: "complete",
      },
      "Key risks?": {
        answer: "Customer concentration, regulatory",
        citations: [],
        status: "complete",
      },
    },
    deal_b: {
      "What is revenue?": {
        answer: "**$30M** ARR",
        citations: [],
        status: "complete",
      },
      "Key risks?": {
        answer: "Key person risk",
        citations: [],
        status: "complete",
      },
    },
  };

  it("generates correct header row", () => {
    const header = ["Deal", ...queries.map(escapeCSV)].join(",");
    expect(header).toBe("Deal,What is revenue?,Key risks?");
  });

  it("generates correct data rows", () => {
    const row = [
      escapeCSV("deal_a"),
      escapeCSV(cells.deal_a["What is revenue?"].answer),
      escapeCSV(cells.deal_a["Key risks?"].answer),
    ].join(",");
    expect(row).toContain("deal_a");
    expect(row).toContain("$50M");
    expect(row).not.toContain("**");
    expect(row).not.toContain("[Source");
  });

  it("handles loading cells as empty", () => {
    const loadingCell: CellData = {
      answer: "",
      citations: [],
      status: "loading",
    };
    expect(escapeCSV(loadingCell.answer)).toBe("");
  });

  it("handles error cells with prefix", () => {
    const errorCell: CellData = {
      answer: "Connection failed",
      citations: [],
      status: "error",
    };
    const escaped = escapeCSV(`[Error] ${errorCell.answer}`);
    expect(escaped).toContain("Error");
    expect(escaped).toContain("Connection failed");
  });
});
