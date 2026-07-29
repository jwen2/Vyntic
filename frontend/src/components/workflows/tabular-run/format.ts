import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { asShape, assertNever, stripSourceMarkers } from "@/lib/cellShapes";

// ── Pure value formatting / string helpers (no React) ──

/**
 * The cell's value for compact, text-only surfaces (tooltips, CSV-ish views,
 * the risk scan). List-ish shapes return an array so callers can render one
 * line per item; everything else returns a single string.
 *
 * The `switch` is exhaustive — adding a `CellShape` kind breaks this build
 * rather than silently falling through to the raw-answer branch, which is how
 * shapes used to leak JSON into text surfaces.
 */
export function formatCellValue(cell: TabularCell, column: WorkflowColumn): string | string[] {
  const shape = asShape(cell.answer_formatted);
  if (shape) {
    switch (shape.kind) {
      case "metric":
        if (shape.raw?.trim()) return compactScalar(shape.raw, column.format);
        if (shape.value == null) return "";
        return [String(shape.value), shape.unit].filter(Boolean).join(" ");
      case "date":
        return shape.iso?.trim() ?? "";
      case "bool":
        return shape.value ? "Yes" : "No";
      case "enum":
        return shape.value?.trim() ?? "";
      case "currency":
        return (shape.codes ?? []).join(", ");
      case "prose": {
        const summary = shape.summary?.trim();
        if (summary) return summary;
        const body = shape.body?.trim();
        return body ? body.split(/\n+/)[0].trim() : "";
      }
      case "list":
        return (shape.items ?? []).map((item) => (item?.text ?? "").trim()).filter(Boolean);
      case "kv":
        return (shape.pairs ?? [])
          .filter((pair) => pair?.key && pair?.value != null)
          .map((pair) => `${pair.key}: ${[pair.value, pair.unit].filter(Boolean).join(" ")}`);
      default:
        return assertNever(shape);
    }
  }

  const raw = stripSourceMarkers(cell.answer).trim();
  if (!raw || isMissingValue(raw)) return "";
  const scalar = compactScalar(raw, column.format);
  if (scalar || column.format !== "bulleted_list") return scalar;
  if (column.format === "bulleted_list") {
    const bullets = raw
      .split(/\n+/)
      .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
      .filter(Boolean);
    if (bullets.length) return bullets;
  }
  return raw.split(/\n+/)[0].trim();
}

export function compactScalar(value: string, format: WorkflowColumn["format"]): string {
  const cleaned = stripSourceMarkers(value).trim();
  if (!cleaned || isMissingValue(cleaned)) return "";

  if (format === "metric" || format === "monetary_amount") {
    const match = cleaned.match(
      /(?:[$€£¥]\s*|(?:USD|EUR|GBP|JPY|CAD|AUD|CNY|CHF|HKD|INR|SGD)\s*)?-?\d[\d,]*(?:\.\d+)?\s*(?:[kKmMbB])?/
    );
    return match?.[0]?.replace(/\s+/g, "") ?? "";
  }
  if (format === "percentage") {
    const match = cleaned.match(/-?\d+(?:\.\d+)?\s*%/);
    return match?.[0]?.replace(/\s+/g, "") ?? "";
  }
  if (format === "number") {
    const match = cleaned.match(/-?\d[\d,]*(?:\.\d+)?/);
    return match?.[0]?.replace(/,/g, "") ?? "";
  }
  if (format === "currency") {
    const matches = cleaned.match(/\b(?:USD|EUR|GBP|JPY|CAD|AUD|CNY|CHF|HKD|INR|SGD)\b/g);
    return matches?.join(", ") ?? "";
  }
  if (format === "yes_no" || format === "bool") {
    const first = cleaned.split(/\W+/)[0]?.toLowerCase();
    if (first === "yes") return "Yes";
    if (first === "no") return "No";
    return "";
  }
  if (format === "date") {
    const match = cleaned.match(/\d{4}-\d{2}-\d{2}(?:\s+to\s+\d{4}-\d{2}-\d{2})?/);
    return match?.[0] ?? "";
  }
  if (format === "enum") {
    return cleaned.split(/\n+/)[0].trim();
  }
  return cleaned.split(/\n+/)[0].trim();
}

export function isMissingValue(value: string): boolean {
  return /^(not stated|not disclosed|not specified|not provided|not mentioned|not addressed|not available|not found|no relevant|n\/a|unknown|unclear)\b/i.test(
    value.replace(/[.\s]+$/g, "").trim()
  );
}

// The row → column label at the top of the cell-detail panel already names
// the column, so any LLM-emitted "## Share-based Compensation" line is
// redundant. Demote markdown headings to bold paragraph text.
export function demoteHeadings(value: string): string {
  return value.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
}

export { stripSourceMarkers } from "@/lib/cellShapes";

export function formatRunDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
