import { describe, expect, it } from "vitest";
import {
  extractNumericData,
  extractTableSeries,
  seriesToChartData,
} from "./numericDetector";

const FIXTURE_TABLE = [
  "| Metric | FY2021 | FY2022 | YoY Change |",
  "| --- | --- | --- | --- |",
  "| Revenue | $36.6M | $42.1M | +$5.5M (+15.0%) |",
  "| Gross Margin | 61.2% | 63.4% | +2.2pp |",
].join("\n");

describe("extractTableSeries", () => {
  it("parses currency rows with the delta column separated out", () => {
    const series = extractTableSeries(FIXTURE_TABLE);
    expect(series).toHaveLength(2);

    const revenue = series[0];
    expect(revenue.metric).toBe("Revenue");
    expect(revenue.periods).toEqual(["FY2021", "FY2022"]);
    expect(revenue.values).toEqual([36.6, 42.1]);
    expect(revenue.delta).toBe("+$5.5M (+15.0%)");
    expect(revenue.isPercentage).toBe(false);
  });

  it("flags percentage rows", () => {
    const series = extractTableSeries(FIXTURE_TABLE);
    const margin = series[1];
    expect(margin.metric).toBe("Gross Margin");
    expect(margin.values).toEqual([61.2, 63.4]);
    expect(margin.isPercentage).toBe(true);
  });

  it("scales $B and plain thousands-separated numbers to $M", () => {
    const table = [
      "| Metric | FY2021 | FY2022 |",
      "| --- | --- | --- |",
      "| GMV | $1.2B | 1,400 |",
    ].join("\n");
    const series = extractTableSeries(table);
    expect(series).toHaveLength(1);
    expect(series[0].values).toEqual([1200, 1400]);
  });

  it("returns [] for prose with no tables", () => {
    expect(extractTableSeries("Revenue grew nicely over the period.")).toEqual([]);
  });

  it("quirk: a 'Δ' header is NOT detected as a delta column (\\b fails on non-ASCII)", () => {
    // The intended delta patterns are "delta"/"change"; \bΔ\b never matches
    // because Δ is not a word character. Pinned so a refactor that fixes this
    // does it knowingly.
    const table = [
      "| Metric | FY2021 | FY2022 | YoY Δ |",
      "| --- | --- | --- | --- |",
      "| Revenue | $36.6M | $42.1M | +$5.5M (+15.0%) |",
    ].join("\n");
    const series = extractTableSeries(table);
    expect(series[0].periods).toEqual(["FY2021", "FY2022", "YoY Δ"]);
    expect(series[0].values).toEqual([36.6, 42.1, 5.5]);
    expect(series[0].delta).toBeUndefined();
  });
});

describe("seriesToChartData", () => {
  it("charts only absolute (non-percentage) metrics when both exist", () => {
    const chart = seriesToChartData(extractTableSeries(FIXTURE_TABLE));
    expect(chart).not.toBeNull();
    expect(chart!.metrics).toEqual(["Revenue"]);
    expect(chart!.data).toEqual([
      { period: "FY2021", Revenue: 36.6 },
      { period: "FY2022", Revenue: 42.1 },
    ]);
  });

  it("returns null for empty input", () => {
    expect(seriesToChartData([])).toBeNull();
  });
});

describe("extractNumericData", () => {
  it("returns data points from the first absolute series of a table", () => {
    const points = extractNumericData(FIXTURE_TABLE);
    expect(points).toEqual([
      { label: "FY2021", value: 36.6 },
      { label: "FY2022", value: 42.1 },
    ]);
  });

  it("returns null for prose without extractable metrics", () => {
    expect(
      extractNumericData("The company serves enterprise customers across Europe.")
    ).toBeNull();
  });
});
