import type { TabularCell, WorkflowColumn } from "@/lib/workflows";

// ── Pure value formatting / string helpers (no React) ──

export function formatCellValue(cell: TabularCell, column: WorkflowColumn): string | string[] {
  const formatted = cell.answer_formatted;
  if (Array.isArray(formatted)) {
    return formatted.map((item) => String(item)).filter(Boolean);
  }
  if (typeof formatted === "boolean") {
    return formatted ? "Yes" : "No";
  }
  if (typeof formatted === "number") {
    if (column.format === "percentage") return `${formatted}%`;
    return Number.isInteger(formatted) ? String(formatted) : String(formatted);
  }
  if (typeof formatted === "string" && formatted.trim()) {
    return formatted.trim();
  }
  if (formatted && typeof formatted === "object") {
    const maybeRaw = (formatted as { raw?: unknown }).raw;
    if (typeof maybeRaw === "string" && maybeRaw.trim()) {
      return compactScalar(maybeRaw, column.format);
    }
    const summary = (formatted as { summary?: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary.trim();
    const body = (formatted as { body?: unknown }).body;
    if (typeof body === "string" && body.trim()) return body.trim().split(/\n+/)[0].trim();
    const items = (formatted as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items
        .map((item) =>
          typeof item === "object" && item !== null && "text" in item
            ? String((item as { text?: unknown }).text ?? "")
            : String(item)
        )
        .filter(Boolean);
    }
    const pairs = (formatted as { pairs?: unknown }).pairs;
    if (Array.isArray(pairs)) {
      return pairs
        .map((pair) => {
          if (!pair || typeof pair !== "object") return "";
          const p = pair as { key?: unknown; value?: unknown; unit?: unknown };
          return [p.key, [p.value, p.unit].filter(Boolean).join(" ")].filter(Boolean).join(": ");
        })
        .filter(Boolean);
    }
    const iso = (formatted as { iso?: unknown }).iso;
    if (typeof iso === "string" && iso.trim()) return iso.trim();
    const shapedValue = (formatted as { value?: unknown }).value;
    const unit = (formatted as { unit?: unknown }).unit;
    if (typeof shapedValue === "boolean") return shapedValue ? "Yes" : "No";
    if (typeof shapedValue === "string" && shapedValue.trim()) return shapedValue.trim();
    if (typeof shapedValue === "number") return [shapedValue, unit].filter(Boolean).join(" ");
    const amount = (formatted as { amount?: unknown }).amount;
    const currency = (formatted as { currency?: unknown }).currency;
    if (amount != null || currency != null) {
      return [currency, amount].filter(Boolean).join(" ");
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

export function stripSourceMarkers(value: string): string {
  return value
    .replace(/\[Source\s+\d+\]/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

export function formatRunDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
