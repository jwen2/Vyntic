import { describe, expect, it } from "vitest";
import {
  buildChartSeries,
  cleanText,
  compareFindingSeverity,
  deriveActions,
  diffPanel,
  escapeRegExp,
  extractBullets,
  extractBulletsWithSources,
  extractFinancialTables,
  extractFirstSourceIdx,
  extractMetrics,
  extractThesisSections,
  inferMetricLabel,
  inferTableTitle,
  isGapFinding,
  isInconsistencyFinding,
  isMarkdownTableLine,
  isNotFound,
  mergeOverrides,
  normalizeForCompare,
  normalizeTableCell,
  normalizeValue,
  pairsToFields,
  parseFinancialNumber,
  parseMarkdownTable,
  severityRank,
  shortenLabel,
  shortenPeriod,
  titleCase,
  type BriefField,
  type FinancialTable,
} from "./DealBriefDashboard";
import type { Finding } from "./types";

/**
 * Characterization tests (FE5.1) — these pin the parsers' behaviour EXACTLY as
 * it is today, ahead of the FE5.2 move into `brief/parse.ts`. If a case looks
 * wrong it is marked `QUIRK` and asserted anyway: the point is to detect a
 * change caused by the move, so "correcting" anything here would make a green
 * suite after the move meaningless. Real bugs are listed in the plan's
 * follow-up notes, to be fixed deliberately and separately.
 */

const finding = (over: Partial<Finding> = {}): Finding =>
  ({ id: "f1", title: "T", detail: "D", sev: "noteworthy", ...over }) as Finding;

describe("cleanText", () => {
  it("strips think blocks, source markers and bold markers", () => {
    expect(cleanText("<think>plan</think> Revenue **grew** [Source 3] fast")).toBe(
      "Revenue grew  fast"
    );
  });

  it("returns empty string for undefined", () => {
    expect(cleanText(undefined)).toBe("");
  });
});

describe("titleCase", () => {
  it("title-cases words and restores known acronyms", () => {
    expect(titleCase("annual recurring revenue")).toBe("Annual Recurring Revenue");
    expect(titleCase("ebitda margin")).toBe("EBITDA Margin");
    expect(titleCase("arr")).toBe("ARR");
    expect(titleCase("mrr growth")).toBe("MRR Growth");
  });

  it("QUIRK: lowercases acronyms it does not know about", () => {
    // Only EBITDA/ARR/MRR are restored, so other all-caps tokens get mangled.
    expect(titleCase("SaaS NRR")).toBe("Saas Nrr");
  });

  it("QUIRK: acronym restoration misses acronyms that are not token-initial", () => {
    // `\w\S*` treats "EV/EBITDA" as ONE token, so it lowercases to "Ev/ebitda"
    // — and the restoration regex `\bEbitda\b` is case-SENSITIVE, so it no
    // longer matches. Only a token-initial acronym survives.
    expect(titleCase("EV/EBITDA")).toBe("Ev/ebitda");
    expect(titleCase("ebitda")).toBe("EBITDA");
  });
});

describe("parseFinancialNumber", () => {
  it("parses currency, percent and multiple suffixes", () => {
    expect(parseFinancialNumber("$12.5")).toBe(12.5);
    expect(parseFinancialNumber("12.5%")).toBe(12.5);
    expect(parseFinancialNumber("3.2x")).toBe(3.2);
    expect(parseFinancialNumber("1,234")).toBe(1234);
  });

  it("normalizes suffixes onto a millions base unit", () => {
    // m is the base (x1), bn x1000, k x0.001 — internally consistent, so a
    // chart mixing $12.5m and $1.2bn plots 12.5 against 1200 correctly.
    expect(parseFinancialNumber("$12.5m")).toBe(12.5);
    expect(parseFinancialNumber("$1.2bn")).toBe(1200);
    expect(parseFinancialNumber("500k")).toBe(0.5);
    // A bare number is therefore also read as millions.
    expect(parseFinancialNumber("1,234")).toBe(1234);
  });

  it("treats parenthesised values as negative", () => {
    expect(parseFinancialNumber("(1,234)")).toBe(-1234);
  });

  it("QUIRK: a leading minus flips sign twice and returns a POSITIVE number", () => {
    // `negative` is true AND parseFloat already returns -5.5, so the -1
    // multiplier cancels it. Parenthesised negatives are unaffected because
    // the parens are stripped before parseFloat. This is a real bug — see the
    // FE5 plan's follow-up notes.
    expect(parseFinancialNumber("-5.5")).toBe(5.5);
  });

  it("returns null for non-numeric sentinels", () => {
    expect(parseFinancialNumber("n/a")).toBeNull();
    expect(parseFinancialNumber("N/A")).toBeNull();
    expect(parseFinancialNumber("Not found")).toBeNull();
    expect(parseFinancialNumber("")).toBeNull();
    expect(parseFinancialNumber("—")).toBeNull();
  });

  it("QUIRK: parses a leading number out of arbitrary trailing prose", () => {
    // The cleaning class /[$€£,%x]/gi strips every letter x anywhere, and
    // parseFloat then stops at the first non-numeric character — so a prose
    // fragment silently yields a number rather than null.
    expect(parseFinancialNumber("6x growth")).toBe(6);
    expect(parseFinancialNumber("12 employees")).toBe(12);
  });
});

describe("shortenLabel / shortenPeriod", () => {
  it("collapses known long financial labels", () => {
    expect(shortenLabel("Adjusted EBITDA (consolidated)")).toBe("Adj. EBITDA");
    expect(shortenLabel("EBITDA margin")).toBe("EBITDA %");
    expect(shortenLabel("Gross margin")).toBe("Gross %");
  });

  it("truncates anything longer than 18 characters", () => {
    expect(shortenLabel("Total contracted annual value")).toBe("Total Contracted...");
  });

  it("strips fiscal-year prefixes from periods", () => {
    expect(shortenPeriod("FY2023")).toBe("2023");
    expect(shortenPeriod("Fiscal Year 2024")).toBe("2024");
    expect(shortenPeriod("Q3 2024")).toBe("Q3 2024");
  });
});

describe("isMarkdownTableLine", () => {
  it("requires at least two pipes", () => {
    expect(isMarkdownTableLine("| a | b |")).toBe(true);
    expect(isMarkdownTableLine("a|b")).toBe(false);
    expect(isMarkdownTableLine("no pipes here")).toBe(false);
  });
});

describe("normalizeTableCell", () => {
  it("strips markers, bold, backticks and collapses whitespace", () => {
    // Whitespace collapse runs last, so the gap left by the stripped marker
    // does not survive into the output.
    expect(normalizeTableCell("  **$12.5m**  [Source 2] `x` ")).toBe("$12.5m x");
  });
});

describe("parseMarkdownTable", () => {
  const table = ["| Metric | FY2023 | FY2024 |", "| --- | --- | --- |", "| Revenue | $10m | $12m |"];

  it("parses headers and body, dropping the separator row", () => {
    const parsed = parseMarkdownTable(table, "Financials");
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe("Financials");
    expect(parsed!.headers).toEqual(["Metric", "FY2023", "FY2024"]);
    expect(parsed!.rows).toEqual([["Revenue", "$10m", "$12m"]]);
  });

  it("pads ragged rows out to the header width", () => {
    const parsed = parseMarkdownTable(
      ["| A | B | C |", "| --- | --- | --- |", "| only |"],
      "T"
    );
    expect(parsed!.rows).toEqual([["only", "", ""]]);
  });

  it("truncates rows wider than the header", () => {
    const parsed = parseMarkdownTable(
      ["| A | B |", "| --- | --- |", "| 1 | 2 | 3 | 4 |"],
      "T"
    );
    expect(parsed!.rows).toEqual([["1", "2"]]);
  });

  it("returns null when there is no body or too few lines", () => {
    expect(parseMarkdownTable(["| A | B |"], "T")).toBeNull();
    expect(parseMarkdownTable(["| A | B |", "| --- | --- |"], "T")).toBeNull();
  });

  it("parses fine without a separator row", () => {
    const parsed = parseMarkdownTable(["| A | B |", "| 1 | 2 |"], "T");
    expect(parsed!.headers).toEqual(["A", "B"]);
    expect(parsed!.rows).toEqual([["1", "2"]]);
  });
});

describe("inferTableTitle", () => {
  it("uses the nearest preceding non-table line, title-cased", () => {
    const lines = ["## revenue bridge", "", "| A | B |", "| 1 | 2 |"];
    expect(inferTableTitle(lines, 2)).toBe("Revenue Bridge");
  });

  it("falls back to Financials when nothing suitable precedes", () => {
    expect(inferTableTitle(["| A | B |"], 0)).toBe("Financials");
  });

  it("skips candidates longer than 70 characters", () => {
    const long = "x".repeat(80);
    expect(inferTableTitle([long, "| A | B |"], 1)).toBe("Financials");
  });
});

describe("extractFinancialTables", () => {
  it("extracts a titled table from prose", () => {
    const answer = ["Revenue detail", "| Metric | FY23 |", "| --- | --- |", "| Revenue | $10m |"].join("\n");
    const tables = extractFinancialTables(answer);
    expect(tables).toHaveLength(1);
    expect(tables[0].title).toBe("Revenue Detail");
    expect(tables[0].headers).toEqual(["Metric", "FY23"]);
  });

  it("ignores tables with fewer than two headers", () => {
    expect(extractFinancialTables("| only |\n| --- |")).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(extractFinancialTables(undefined)).toEqual([]);
    expect(extractFinancialTables("")).toEqual([]);
  });
});

describe("buildChartSeries", () => {
  const table: FinancialTable = {
    title: "T",
    headers: ["Metric", "FY2023", "FY2024"],
    rows: [
      ["Revenue", "$10m", "$12m"],
      ["Headcount", "100", "120"],
    ],
  };

  it("builds a series only for recognised financial row labels", () => {
    const series = buildChartSeries(table);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("Revenue");
    expect(series[0].values.map((v) => v.value)).toEqual([10, 12]);
    expect(series[0].values.map((v) => v.period)).toEqual(["2023", "2024"]);
  });

  it("returns nothing when the table has fewer than three columns", () => {
    expect(buildChartSeries({ title: "T", headers: ["A", "B"], rows: [["Revenue", "1"]] })).toEqual([]);
  });

  it("drops series with fewer than two numeric points", () => {
    expect(
      buildChartSeries({
        title: "T",
        headers: ["Metric", "A", "B"],
        rows: [["Revenue", "$10m", "n/a"]],
      })
    ).toEqual([]);
  });
});

describe("extractMetrics", () => {
  it("pairs a keyword line with its values", () => {
    const metrics = extractMetrics("- Revenue: $12.5m growing 20%");
    expect(metrics).toHaveLength(1);
    expect(metrics[0].label).toBe("Revenue");
    expect(metrics[0].value).toBe("$12.5m / 20%");
  });

  it("ignores lines with a keyword but no value", () => {
    expect(extractMetrics("Revenue was strong this year")).toEqual([]);
  });

  it("ignores lines with a value but no keyword", () => {
    expect(extractMetrics("Headcount: 120")).toEqual([]);
  });

  it("de-duplicates on label plus first value", () => {
    expect(extractMetrics("Revenue: $10m\nRevenue: $10m")).toHaveLength(1);
  });
});

describe("inferMetricLabel", () => {
  it("prefers the text before a colon or pipe", () => {
    expect(inferMetricLabel("Net revenue retention: 118%", "NRR")).toBe("Net Revenue Retention");
  });

  it("falls back to the keyword when the prefix is too long", () => {
    const long = "a".repeat(40);
    expect(inferMetricLabel(`${long}: 10%`, "Revenue")).toBe("Revenue");
  });
});

describe("extractBullets", () => {
  it("strips list markers and drops short lines", () => {
    const out = extractBullets("- This is a sufficiently long bullet line\n- short\n1. Another long enough bullet");
    expect(out).toEqual([
      "This is a sufficiently long bullet line",
      "Another long enough bullet",
    ]);
  });

  it("caps at six bullets and truncates long ones", () => {
    const long = "x".repeat(200);
    expect(extractBullets(long)[0]).toHaveLength(150);
    expect(extractBullets(Array.from({ length: 10 }, (_, i) => `bullet number ${i} padded out`).join("\n"))).toHaveLength(6);
  });
});

describe("extractFirstSourceIdx", () => {
  it("reads the first source index", () => {
    expect(extractFirstSourceIdx("value [Source 3] more [Source 5]")).toBe(3);
  });

  it("returns undefined when absent or zero", () => {
    expect(extractFirstSourceIdx("no marker")).toBeUndefined();
    expect(extractFirstSourceIdx("[Source 0]")).toBeUndefined();
  });
});

describe("extractBulletsWithSources", () => {
  it("splits bullets and lifts the source index out", () => {
    const out = extractBulletsWithSources("- Customer concentration is high [Source 2]");
    expect(out).toEqual([{ text: "Customer concentration is high", sourceIdx: 2 }]);
  });

  it("drops bare label lines and 'not found'", () => {
    expect(extractBulletsWithSources("Risks:\nNot found")).toEqual([]);
  });
});

describe("extractThesisSections", () => {
  it("assigns bullets to the section heading above them", () => {
    const answer = [
      "Thesis",
      "- Durable recurring revenue base",
      "Value creation levers",
      "- Pricing uplift across the install base",
      "Risks",
      "- Customer concentration in top ten accounts",
    ].join("\n");
    const out = extractThesisSections(answer);
    expect(out.thesis.map((b) => b.text)).toEqual(["Durable recurring revenue base"]);
    expect(out.levers.map((b) => b.text)).toEqual(["Pricing uplift across the install base"]);
    expect(out.risks.map((b) => b.text)).toEqual(["Customer concentration in top ten accounts"]);
    expect(out.exit).toEqual([]);
  });

  it("handles a heading with inline content", () => {
    const out = extractThesisSections("Thesis: A strong niche leader [Source 1]");
    expect(out.thesis).toEqual([{ text: "A strong niche leader", sourceIdx: 1 }]);
  });

  it("ignores content before any recognised heading", () => {
    expect(extractThesisSections("Some preamble text here").thesis).toEqual([]);
  });

  it("returns all-empty for empty input", () => {
    expect(extractThesisSections(undefined)).toEqual({ thesis: [], levers: [], exit: [], risks: [] });
  });
});

describe("pairsToFields", () => {
  it("keeps only whitelisted keys, title-cased, joined with unit", () => {
    const out = pairsToFields(
      { pairs: [{ key: "sector", value: "Software" }, { key: "unlisted", value: "x" }] },
      ["Sector"]
    );
    expect(out).toEqual([{ label: "Sector", value: "Software", sourceIdx: undefined }]);
  });

  it("lifts a source marker that the model tucked into `unit`", () => {
    // Documented F3.3 quirk: the marker can arrive in `unit`, not `value`.
    const out = pairsToFields(
      { pairs: [{ key: "revenue", value: "$12.5m", unit: "[Source 4]" }] },
      ["Revenue"]
    );
    expect(out).toEqual([{ label: "Revenue", value: "$12.5m", sourceIdx: 4 }]);
  });

  it("de-duplicates repeated keys and caps at seven fields", () => {
    const pairs = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));
    const labels = pairs.map((p) => p.key);
    expect(pairsToFields({ pairs }, labels)).toHaveLength(7);
    expect(pairsToFields({ pairs: [{ key: "a", value: "1" }, { key: "a", value: "2" }] }, ["a"])).toHaveLength(1);
  });

  it("returns [] for untyped or missing payloads", () => {
    expect(pairsToFields(undefined, ["Sector"])).toEqual([]);
    expect(pairsToFields({ notPairs: 1 } as never, ["Sector"])).toEqual([]);
    expect(pairsToFields([] as never, ["Sector"])).toEqual([]);
  });

  it("skips pairs with empty values", () => {
    expect(pairsToFields({ pairs: [{ key: "sector", value: "" }] }, ["Sector"])).toEqual([]);
  });
});

describe("mergeOverrides", () => {
  const base: BriefField[] = [{ label: "Sector", value: "Software", sourceIdx: 2 }];

  it("returns the original array when there are no overrides", () => {
    expect(mergeOverrides(base, undefined, [])).toBe(base);
    expect(mergeOverrides(base, {}, [])).toBe(base);
  });

  it("replaces a matching field and clears its citation", () => {
    const out = mergeOverrides(base, { Sector: "Healthcare" }, []);
    expect(out).toEqual([{ label: "Sector", value: "Healthcare", sourceIdx: undefined, override: true }]);
  });

  it("appends unmatched overrides in preferred-label order", () => {
    const out = mergeOverrides(base, { Geography: "EU", Stage: "Growth" }, ["Stage", "Geography"]);
    expect(out.map((f) => f.label)).toEqual(["Sector", "Stage", "Geography"]);
  });

  it("matches labels case-insensitively", () => {
    expect(mergeOverrides(base, { sector: "Healthcare" }, [])[0].value).toBe("Healthcare");
  });
});

describe("normalizeValue / normalizeForCompare / isNotFound", () => {
  it("normalizes whitespace and canonicalises 'not found'", () => {
    expect(normalizeValue("  a   b ")).toBe("a b");
    expect(normalizeValue("NOT FOUND")).toBe("Not found");
  });

  it("compares case- and whitespace-insensitively", () => {
    expect(normalizeForCompare("  A  B ")).toBe("a b");
  });

  it("detects the not-found sentinel", () => {
    expect(isNotFound("Not found")).toBe(true);
    // `\s+` absorbs runs of inner whitespace, and the value is trimmed first.
    expect(isNotFound(" not   found ")).toBe(true);
    expect(isNotFound("found")).toBe(false);
    expect(isNotFound("not found yet")).toBe(false);
  });
});

describe("diffPanel", () => {
  const f = (label: string, value: string, over?: Partial<BriefField>): BriefField =>
    ({ label, value, ...over });

  it("reports a changed value", () => {
    const out = diffPanel("snapshot", "Deal snapshot", [f("Sector", "Software")], [f("Sector", "Healthcare")]);
    expect(out).toEqual([
      { panel: "snapshot", panelLabel: "Deal snapshot", label: "Sector", before: "Software", after: "Healthcare", kind: "changed" },
    ]);
  });

  it("reports additions and removals", () => {
    expect(diffPanel("snapshot", "L", [], [f("Sector", "Software")])[0].kind).toBe("added");
    expect(diffPanel("snapshot", "L", [f("Sector", "Software")], [])[0].kind).toBe("removed");
  });

  it("treats a not-found transition as add or remove, not change", () => {
    expect(diffPanel("snapshot", "L", [f("A", "Not found")], [f("A", "X")])[0].kind).toBe("added");
    expect(diffPanel("snapshot", "L", [f("A", "X")], [f("A", "Not found")])[0].kind).toBe("removed");
    expect(diffPanel("snapshot", "L", [f("A", "Not found")], [f("A", "Not found")])).toEqual([]);
  });

  it("ignores analyst-overridden fields on either side", () => {
    expect(diffPanel("snapshot", "L", [f("A", "X")], [f("A", "Y", { override: true })])).toEqual([]);
    expect(diffPanel("snapshot", "L", [f("A", "X", { override: true })], [f("A", "Y")])).toEqual([]);
  });

  it("ignores pure whitespace and case differences", () => {
    expect(diffPanel("snapshot", "L", [f("A", "Software")], [f("A", "  software ")])).toEqual([]);
  });
});

describe("finding helpers", () => {
  it("ranks and sorts by severity, most severe first", () => {
    expect(severityRank("deal-breaker")).toBe(3);
    expect(severityRank("material")).toBe(2);
    expect(severityRank("noteworthy")).toBe(1);
    const sorted = [finding({ sev: "noteworthy" }), finding({ sev: "deal-breaker" })].sort(compareFindingSeverity);
    expect(sorted[0].sev).toBe("deal-breaker");
  });

  it("classifies gap and inconsistency findings by keyword", () => {
    expect(isGapFinding(finding({ title: "Missing disclosure" }))).toBe(true);
    expect(isInconsistencyFinding(finding({ detail: "figures conflict" }))).toBe(true);
    expect(isGapFinding(finding({ title: "All good", detail: "fine" }))).toBe(false);
  });
});

describe("deriveActions", () => {
  it("prefers typed list items", () => {
    const out = deriveActions({ items: [{ text: "Request the QoE [Source 2]" }] }, undefined, []);
    expect(out).toEqual([{ text: "Request the QoE", sourceIdx: 2 }]);
  });

  it("accepts plain-string items", () => {
    expect(deriveActions({ items: ["Reconcile the model"] }, undefined, [])[0].text).toBe("Reconcile the model");
  });

  it("falls back to parsing the raw answer", () => {
    expect(deriveActions(undefined, "- Confirm the working capital peg", [])[0].text).toBe(
      "Confirm the working capital peg"
    );
  });

  it("caps explicit actions at five", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ text: `Action number ${i}` }));
    expect(deriveActions({ items }, undefined, [])).toHaveLength(5);
  });

  it("derives fallback actions from findings when nothing explicit exists", () => {
    expect(deriveActions(undefined, undefined, [finding({ sev: "deal-breaker" })])[0].text).toMatch(
      /deal-breaker/i
    );
    expect(deriveActions(undefined, undefined, [finding({ title: "Missing schedule" })])[0].text).toMatch(
      /missing VDR/i
    );
    expect(deriveActions(undefined, undefined, [])).toEqual([]);
  });

  it("uses the generic fallback when findings match no category", () => {
    expect(deriveActions(undefined, undefined, [finding({ title: "Note", detail: "ok" })])[0].text).toMatch(
      /route each item/i
    );
  });
});

describe("escapeRegExp", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
});
