export interface NumericDataPoint {
  label: string;
  value: number;
}

/**
 * Extract numeric data points from an LLM answer for charting.
 * Conservative: returns null if fewer than 2 data points found.
 */
export function extractNumericData(answer: string): NumericDataPoint[] | null {
  const points: NumericDataPoint[] = [];
  const seen = new Set<string>();

  // Match patterns like "Revenue: $42M", "EBITDA: $10.5M", "Margin: 23.5%"
  // Also "Revenue of $42M", "EBITDA was $10.5M"
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
      // For percentages, keep raw value
      if (suffix === "%") value = rawNum;

      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        points.push({ label, value });
      }
    }
  }

  // Also try to extract from markdown tables: | Metric | $42M |
  const tableRowPattern = /\|\s*([^|]+?)\s*\|\s*\$?([\d,.]+)\s*([MBK%])?[^|]*\|/gi;
  let tableMatch;
  while ((tableMatch = tableRowPattern.exec(answer)) !== null) {
    const label = tableMatch[1].trim().replace(/\*+/g, "");
    const rawNum = parseFloat(tableMatch[2].replace(/,/g, ""));
    const suffix = (tableMatch[3] || "").toUpperCase();

    if (isNaN(rawNum) || label.length > 40 || label.length < 2) continue;
    if (/^[-:]+$/.test(label)) continue; // skip separator rows

    let value = rawNum;
    if (suffix === "M") value = rawNum;
    else if (suffix === "B") value = rawNum * 1000;
    else if (suffix === "K") value = rawNum / 1000;

    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      points.push({ label, value });
    }
  }

  return points.length >= 2 ? points.slice(0, 8) : null;
}
