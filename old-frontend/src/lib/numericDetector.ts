export interface NumericDataPoint {
  label: string;
  value: number;
}

export interface TableSeries {
  metric: string;
  periods: string[];
  values: number[];
  delta?: string; // raw delta string like "+$5.6M (+15.3%)"
  isPercentage: boolean;
}

/**
 * Parse a numeric value from a table cell string.
 * Handles: $42.1M, $5.2B, 17.3%, 1,200, etc.
 * Returns null if not a recognizable number.
 */
function parseTableValue(raw: string): { value: number; isPercentage: boolean } | null {
  const cleaned = raw.trim().replace(/\*+/g, "");
  if (!cleaned || /^[-–—:]+$/.test(cleaned)) return null;

  // Check if it's a percentage
  const pctMatch = cleaned.match(/^([+-]?\s*[\d,.]+)\s*%/);
  if (pctMatch) {
    const val = parseFloat(pctMatch[1].replace(/[,\s]/g, ""));
    return isNaN(val) ? null : { value: val, isPercentage: true };
  }

  // Check for dollar amounts with suffixes
  const dollarMatch = cleaned.match(/^[+-]?\s*\$?\s*([\d,.]+)\s*([BMKTbmkt])?/);
  if (dollarMatch) {
    const val = parseFloat(dollarMatch[1].replace(/,/g, ""));
    if (isNaN(val)) return null;
    const suffix = (dollarMatch[2] || "").toUpperCase();
    let multiplied = val;
    if (suffix === "T") multiplied = val * 1000000;
    else if (suffix === "B") multiplied = val * 1000;
    else if (suffix === "M") multiplied = val;
    else if (suffix === "K") multiplied = val / 1000;
    return { value: multiplied, isPercentage: false };
  }

  // Plain number
  const plainMatch = cleaned.match(/^[+-]?\s*([\d,.]+)/);
  if (plainMatch) {
    const val = parseFloat(plainMatch[1].replace(/,/g, ""));
    return isNaN(val) ? null : { value: val, isPercentage: false };
  }

  return null;
}

/**
 * Extract structured time-series data from markdown tables in an LLM answer.
 * Expects tables in format: | Metric | FY2021 | FY2022 | FY2023 | YoY Δ |
 * Returns array of series, one per metric row.
 */
export function extractTableSeries(markdown: string): TableSeries[] {
  const series: TableSeries[] = [];

  // Find markdown tables
  const tableRegex = /(?:^|\n)(\|[^\n]+\|)\n(\|[\s:|-]+\|)\n((?:\|[^\n]+\|\n?)+)/gm;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(markdown)) !== null) {
    const headerLine = tableMatch[1];
    const dataLines = tableMatch[3].trim().split("\n");

    // Parse headers
    const headers = headerLine
      .split("|")
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    if (headers.length < 3) continue; // Need metric + at least 2 periods

    // Detect which columns are period columns vs delta column
    const deltaPattern = /\bΔ\b|delta|change/i;
    const periodHeaders: string[] = [];
    let deltaColIdx = -1;

    for (let i = 1; i < headers.length; i++) {
      if (deltaPattern.test(headers[i])) {
        deltaColIdx = i;
      } else {
        periodHeaders.push(headers[i]);
      }
    }

    // Parse data rows
    for (const line of dataLines) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (cells.length < 2) continue;
      const metric = cells[0].replace(/\*+/g, "").trim();
      if (!metric || /^[-–—:]+$/.test(metric)) continue;

      const values: number[] = [];
      let isPercentage = false;
      let delta: string | undefined;
      let hasAnyValue = false;

      for (let i = 1; i < cells.length; i++) {
        if (i === deltaColIdx) {
          delta = cells[i].replace(/\*+/g, "").trim();
          continue;
        }
        const parsed = parseTableValue(cells[i]);
        if (parsed) {
          values.push(parsed.value);
          isPercentage = parsed.isPercentage;
          hasAnyValue = true;
        } else {
          values.push(NaN);
        }
      }

      if (hasAnyValue && values.filter((v) => !isNaN(v)).length >= 2) {
        series.push({
          metric,
          periods: periodHeaders,
          values,
          delta,
          isPercentage,
        });
      }
    }
  }

  return series;
}

/**
 * Convert table series into recharts-compatible data format.
 * Each data point is a period, with keys for each metric.
 */
export function seriesToChartData(
  series: TableSeries[]
): { data: Record<string, string | number>[]; metrics: string[] } | null {
  if (series.length === 0) return null;

  const periods = series[0].periods;
  if (periods.length < 2) return null;

  // Only chart non-percentage metrics (absolute values) for the main chart
  const absMetrics = series.filter((s) => !s.isPercentage);
  const pctMetrics = series.filter((s) => s.isPercentage);

  const metricsToChart = absMetrics.length > 0 ? absMetrics : pctMetrics;
  if (metricsToChart.length === 0) return null;

  const data: Record<string, string | number>[] = periods.map((period, i) => {
    const point: Record<string, string | number> = { period };
    for (const s of metricsToChart) {
      const val = s.values[i];
      if (!isNaN(val)) {
        point[s.metric] = val;
      }
    }
    return point;
  });

  return { data, metrics: metricsToChart.map((s) => s.metric) };
}

/**
 * Legacy: Extract numeric data points from an LLM answer for simple charting.
 */
export function extractNumericData(answer: string): NumericDataPoint[] | null {
  // First try structured table extraction
  const series = extractTableSeries(answer);
  if (series.length > 0) {
    // Return the first non-percentage series as simple data points
    const mainSeries = series.find((s) => !s.isPercentage) || series[0];
    const points: NumericDataPoint[] = [];
    for (let i = 0; i < mainSeries.periods.length; i++) {
      if (!isNaN(mainSeries.values[i])) {
        points.push({ label: mainSeries.periods[i], value: mainSeries.values[i] });
      }
    }
    if (points.length >= 2) return points;
  }

  // Fallback: regex extraction from prose
  const points: NumericDataPoint[] = [];
  const seen = new Set<string>();

  const metricPatterns = [
    /\*{0,2}([\w\s\/]+?)\*{0,2}[:\s]+(?:was|of|at|is)?\s*\$?([\d,.]+)\s*([MBKmk%](?:illion|illion)?)/gi,
  ];

  for (const pattern of metricPatterns) {
    let match;
    while ((match = pattern.exec(answer)) !== null) {
      const label = match[1].trim().replace(/\*+/g, "");
      const rawNum = parseFloat(match[2].replace(/,/g, ""));
      const suffix = match[3].toUpperCase();
      if (isNaN(rawNum) || label.length > 40 || label.length < 2) continue;
      let value = rawNum;
      if (suffix === "B" || suffix.startsWith("B")) value = rawNum * 1000;
      else if (suffix === "M" || suffix.startsWith("M")) value = rawNum;
      else if (suffix === "K" || suffix.startsWith("K")) value = rawNum / 1000;
      if (suffix === "%") value = rawNum;
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        points.push({ label, value });
      }
    }
  }

  return points.length >= 2 ? points.slice(0, 8) : null;
}
