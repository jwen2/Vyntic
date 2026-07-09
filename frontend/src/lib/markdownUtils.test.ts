import { describe, expect, it } from "vitest";
import { fixMarkdownTables } from "./markdownUtils";

describe("fixMarkdownTables", () => {
  it("leaves a well-formed table unchanged", () => {
    const input = [
      "Revenue grew steadily.",
      "",
      "| Metric | FY2023 |",
      "| --- | --- |",
      "| Revenue | $10.0M |",
      "| EBITDA | $2.1M |",
    ].join("\n");
    expect(fixMarkdownTables(input)).toBe(input);
  });

  it("passes through plain prose untouched", () => {
    const input = "No tables here.\nJust two lines of prose.";
    expect(fixMarkdownTables(input)).toBe(input);
  });

  it("inserts a missing blank line between text and a table header", () => {
    const input = [
      "Summary of results:",
      "| Metric | FY2023 |",
      "| --- | --- |",
      "| Revenue | $10.0M |",
    ].join("\n");
    expect(fixMarkdownTables(input)).toBe(
      [
        "Summary of results:",
        "",
        "| Metric | FY2023 |",
        "| --- | --- |",
        "| Revenue | $10.0M |",
      ].join("\n")
    );
  });

  it("rebuilds a table concatenated onto a single line", () => {
    const input =
      "| Metric | FY2023 | | --- | --- | | Revenue | $10.0M | | EBITDA | $2.1M |";
    expect(fixMarkdownTables(input)).toBe(
      [
        "| Metric | FY2023 |",
        "| --- | --- |",
        "| Revenue | $10.0M |",
        "| EBITDA | $2.1M |",
      ].join("\n")
    );
  });

  it("separates prefix prose glued to a concatenated table", () => {
    const input =
      "as detailed below. | Metric | FY2023 | | --- | --- | | Revenue | $10.0M |";
    expect(fixMarkdownTables(input)).toBe(
      [
        "as detailed below.",
        "",
        "| Metric | FY2023 |",
        "| --- | --- |",
        "| Revenue | $10.0M |",
      ].join("\n")
    );
  });

  it("splits a body row that glued multiple records together", () => {
    const input = [
      "| Metric | FY2023 |",
      "| --- | --- |",
      "| Revenue | $10.0M | EBITDA | $2.1M |",
    ].join("\n");
    expect(fixMarkdownTables(input)).toBe(
      [
        "| Metric | FY2023 |",
        "| --- | --- |",
        "| Revenue | $10.0M |",
        "| EBITDA | $2.1M |",
      ].join("\n")
    );
  });

  it("replaces a table whose value cells are all 'Not found' with a placeholder", () => {
    const input = [
      "| Metric | FY2023 |",
      "| --- | --- |",
      "| Revenue | Not found |",
      "| EBITDA | N/A |",
    ].join("\n");
    expect(fixMarkdownTables(input)).toBe("_No data found in scanned documents._");
  });

  it("keeps a table when at least one value cell has data", () => {
    const input = [
      "| Metric | FY2023 |",
      "| --- | --- |",
      "| Revenue | $10.0M |",
      "| EBITDA | Not found |",
    ].join("\n");
    expect(fixMarkdownTables(input)).toBe(input);
  });
});
