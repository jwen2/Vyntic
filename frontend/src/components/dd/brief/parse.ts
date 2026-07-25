// Text/markdown parsers that turn a scan cell's answer into the brief's
// typed shapes. Extracted verbatim from DealBriefDashboard.tsx (FE5.2).
//
// Behaviour here is pinned by briefParsers.test.ts, including several
// documented quirks — see that file before changing anything.

import type { Finding } from "../types";
import {
  METRIC_KEYWORDS,
  VALUE_PATTERN,
  type BriefField,
  type ChartPoint,
  type ChartSeries,
  type FinancialTable,
  type Metric,
  type QuestionResult,
  type ThesisBullet,
  type ThesisSections,
} from "./config";
import { isGapFinding, isInconsistencyFinding } from "./findings";

export function cleanText(text = ""): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\[Source\s+\d+\]/gi, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function titleCase(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .replace(/\bEbitda\b/g, "EBITDA")
    .replace(/\bArr\b/g, "ARR")
    .replace(/\bMrr\b/g, "MRR");
}

export function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^not\s+found$/i, "Not found").trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractFirstSourceIdx(text: string): number | undefined {
  const match = text.match(/\[Source\s+(\d+)\]/i);
  if (!match) return undefined;
  const idx = Number.parseInt(match[1], 10);
  return Number.isFinite(idx) && idx > 0 ? idx : undefined;
}

/**
 * Build the snapshot/transaction fields straight from the KV cell's typed
 * `answer_formatted.pairs`. Only keys in `preferredLabels` are surfaced (same
 * whitelist the old prose regex enforced); values are title-cased and
 * unit-joined. Returns [] when the cell has no typed pairs (old runs) so the
 * panel falls back to rendering `answer` as markdown.
 */
export function pairsToFields(formatted: QuestionResult["formatted"], preferredLabels: string[]): BriefField[] {
  if (!formatted || typeof formatted !== "object" || Array.isArray(formatted)) return [];
  const pairs = (formatted as { pairs?: Array<{ key?: string; value?: string | number; unit?: string | null }> }).pairs;
  if (!Array.isArray(pairs)) return [];
  const allow = new Set(preferredLabels.map((l) => l.toLowerCase()));
  const fields: BriefField[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const key = (pair?.key ?? "").trim();
    if (!key || !allow.has(key.toLowerCase())) continue;
    const label = titleCase(key);
    if (seen.has(label.toLowerCase())) continue;
    const rawValue = pair?.value;
    if (rawValue == null || rawValue === "") continue;
    const unit = (pair?.unit ?? "").trim();
    // The LLM sometimes tucks the "[Source N]" marker into `unit`, so build the
    // combined string first, then pull the source index and strip the marker —
    // mirroring the old synthesize(value+unit) → extractFields behavior.
    const combined = `${rawValue}${unit ? ` ${unit}` : ""}`;
    const sourceIdx = extractFirstSourceIdx(combined);
    const value = normalizeValue(combined.replace(/\[Source\s+\d+\]/gi, ""));
    if (!value) continue;
    seen.add(label.toLowerCase());
    fields.push({ label, value, sourceIdx });
  }
  return fields.slice(0, 7);
}

export function inferMetricLabel(line: string, keyword: string): string {
  const colonLabel = line.split(/[:|]/)[0]?.trim();
  if (colonLabel && colonLabel.length <= 34 && /[a-z]/i.test(colonLabel)) return titleCase(colonLabel);
  return keyword;
}

export function extractMetrics(answer: string | undefined): Metric[] {
  const text = cleanText(answer);
  if (!text) return [];
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").replace(/^\|+|\|+$/g, "").trim())
    .filter(Boolean);
  const metrics: Metric[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*\|\s*/g, " | ");
    const keyword = METRIC_KEYWORDS.find((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`, "i").test(line));
    if (!keyword) continue;
    const values = line.match(VALUE_PATTERN);
    if (!values?.length) continue;
    const label = inferMetricLabel(line, keyword);
    const key = `${label}:${values[0]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    metrics.push({
      label,
      value: values.slice(0, 3).join(" / "),
      context: line.replace(/\s+/g, " ").slice(0, 90),
    });
    if (metrics.length >= 10) break;
  }

  return metrics;
}

export function isMarkdownTableLine(line: string): boolean {
  return line.includes("|") && line.split("|").length >= 3;
}

export function inferTableTitle(lines: string[], tableStart: number): string {
  for (let i = tableStart - 1; i >= Math.max(0, tableStart - 4); i--) {
    const candidate = lines[i]
      .replace(/^#+\s*/, "")
      .replace(/^\s*[-*]\s*/, "")
      .trim();
    if (!candidate || isMarkdownTableLine(candidate) || /^:?-{3,}:?$/.test(candidate)) continue;
    if (candidate.length <= 70) return titleCase(candidate);
  }
  return "Financials";
}

export function normalizeTableCell(value: string): string {
  return value
    .replace(/\[Source\s+\d+\]/gi, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMarkdownTable(lines: string[], title: string): FinancialTable | null {
  if (lines.length < 2) return null;
  const rows = lines
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => normalizeTableCell(cell))
    )
    .filter((row) => row.some(Boolean));
  if (rows.length < 2) return null;

  const headers = rows[0];
  const body = rows
    .slice(1)
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map((row) => {
      const normalized = [...row];
      while (normalized.length < headers.length) normalized.push("");
      return normalized.slice(0, headers.length);
    });
  if (body.length === 0) return null;
  return { title, headers, rows: body };
}

export function extractFinancialTables(answer: string | undefined): FinancialTable[] {
  const text = cleanText(answer);
  if (!text) return [];
  const lines = text.split("\n");
  const tables: FinancialTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!isMarkdownTableLine(line)) continue;

    const title = inferTableTitle(lines, i);
    const block: string[] = [];
    while (i < lines.length && isMarkdownTableLine(lines[i].trim())) {
      block.push(lines[i].trim());
      i += 1;
    }

    const parsed = parseMarkdownTable(block, title);
    if (parsed && parsed.headers.length >= 2 && parsed.rows.length > 0) {
      tables.push(parsed);
    }
  }

  return tables.slice(0, 4);
}

export function parseFinancialNumber(value: string): number | null {
  const cleaned = value
    .replace(/\[Source\s+\d+\]/gi, "")
    .replace(/[$€£,%x]/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned || /^n\/?a$/i.test(cleaned) || /notfound/i.test(cleaned)) return null;
  const negative = /^\(.+\)$/.test(cleaned) || /^-/.test(cleaned);
  const magnitude = /bn|b$/i.test(cleaned) ? 1000 : /k$/i.test(cleaned) ? 0.001 : 1;
  const normalized = cleaned.replace(/[(),]/g, "").replace(/mm|m|bn|b|k/gi, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return (negative ? -1 : 1) * parsed * magnitude;
}

export function shortenLabel(label: string): string {
  const cleaned = titleCase(label.replace(/\s*\([^)]*\)/g, ""));
  if (/Adjusted EBITDA/i.test(cleaned)) return "Adj. EBITDA";
  if (/EBITDA Margin/i.test(cleaned)) return "EBITDA %";
  if (/Gross Margin/i.test(cleaned)) return "Gross %";
  return cleaned.length > 18 ? cleaned.slice(0, 16) + "..." : cleaned;
}

export function shortenPeriod(period: string): string {
  return period.replace(/Fiscal Year|FY|Calendar Year/gi, "").replace(/\s+/g, " ").trim();
}

export function buildChartSeries(table: FinancialTable): ChartSeries[] {
  if (table.headers.length < 3) return [];
  const periodHeaders = table.headers.slice(1);
  const candidateRows = table.rows.filter((row) => {
    const label = row[0] || "";
    const numericCount = row.slice(1).filter((cell) => parseFinancialNumber(cell) !== null).length;
    return numericCount >= 2 && /revenue|sales|gross profit|ebitda|income|cash flow|arr|margin/i.test(label);
  });

  return candidateRows.slice(0, 4).map((row) => ({
    label: shortenLabel(row[0] || "Metric"),
    values: periodHeaders
      .map((period, idx) => {
        const display = row[idx + 1] || "";
        const value = parseFinancialNumber(display);
        if (value === null) return null;
        return { period: shortenPeriod(period), value, display };
      })
      .filter((point): point is ChartPoint => point !== null),
  })).filter((series) => series.values.length >= 2);
}

export function extractBullets(answer: string | undefined): string[] {
  const text = cleanText(answer);
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter((line) => line.length > 18 && !/^#+\s/.test(line))
    .map((line) => (line.length > 150 ? line.slice(0, 147) + "..." : line))
    .slice(0, 6);
}

export function extractBulletsWithSources(answer: string | undefined): ThesisBullet[] {
  if (!answer) return [];
  const sanitized = answer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!sanitized) return [];
  const lines = sanitized
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter((line) => line.length > 12 && !/^#+\s/.test(line) && !/^[A-Z][A-Za-z ]+:\s*$/.test(line));
  const bullets: ThesisBullet[] = [];
  for (const raw of lines) {
    const sourceIdx = extractFirstSourceIdx(raw);
    const text = raw.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
    if (!text || /^not\s+found$/i.test(text)) continue;
    bullets.push({ text, sourceIdx });
  }
  return bullets;
}

export const THESIS_SECTION_HEADINGS: Array<{ key: keyof ThesisSections; pattern: RegExp }> = [
  { key: "thesis", pattern: /^thesis\b/i },
  { key: "levers", pattern: /^value\s*creation\s*levers\b/i },
  { key: "exit", pattern: /^exit\s*considerations\b/i },
  { key: "risks", pattern: /^risks?\s*(?:to\s*thesis)?\b/i },
];

export function extractThesisSections(answer: string | undefined): ThesisSections {
  const empty: ThesisSections = { thesis: [], levers: [], exit: [], risks: [] };
  if (!answer) return empty;
  const sanitized = answer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!sanitized) return empty;

  const sections: ThesisSections = { thesis: [], levers: [], exit: [], risks: [] };
  let current: keyof ThesisSections | null = null;
  for (const rawLine of sanitized.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const heading = trimmed.replace(/^\s*[-*]\s*/, "").replace(/^#+\s*/, "");
    const matched = THESIS_SECTION_HEADINGS.find((h) => h.pattern.test(heading));
    if (matched && /:|—|–/.test(heading) === false && /^[A-Za-z ]+$/.test(heading.split(/[:—–]/)[0])) {
      // pure heading line like "Thesis" or "Value creation levers"
      current = matched.key;
      continue;
    }
    if (matched && /^[A-Za-z][^:]+:/.test(heading)) {
      // heading with inline content e.g. "Thesis: foo" — switch section and treat the rest as the first bullet
      current = matched.key;
      const inline = heading.split(/:\s*/).slice(1).join(": ").trim();
      if (inline) {
        const sourceIdx = extractFirstSourceIdx(inline);
        const text = inline.replace(/\[Source\s+\d+\]/gi, "").trim();
        if (text && !/^not\s+found$/i.test(text)) sections[current].push({ text, sourceIdx });
      }
      continue;
    }
    if (!current) continue;
    const bulletText = trimmed.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim();
    if (!bulletText || /^not\s+found$/i.test(bulletText)) continue;
    const sourceIdx = extractFirstSourceIdx(bulletText);
    const text = bulletText.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const truncated = text.length > 180 ? text.slice(0, 177) + "..." : text;
    sections[current].push({ text: truncated, sourceIdx });
  }
  return sections;
}

export function deriveActions(
  formatted: QuestionResult["formatted"],
  answer: string | undefined,
  findings: Finding[]
): ThesisBullet[] {
  // Prefer the list cell's typed items; fall back to bullet-parsing the raw
  // answer for old runs whose cells have no answer_formatted.
  let explicit: ThesisBullet[] = [];
  if (formatted && typeof formatted === "object" && !Array.isArray(formatted)) {
    const items = (formatted as { items?: Array<{ text?: string } | string> }).items;
    if (Array.isArray(items)) {
      for (const item of items) {
        const rawText = typeof item === "string" ? item : item?.text ?? "";
        const sourceIdx = extractFirstSourceIdx(rawText);
        const text = rawText.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
        if (text && !/^not\s+found$/i.test(text)) explicit.push({ text, sourceIdx });
      }
    }
  }
  if (explicit.length === 0) explicit = extractBulletsWithSources(answer);
  explicit = explicit.slice(0, 5);
  if (explicit.length > 0) return explicit;

  const fallbacks: ThesisBullet[] = [];
  if (findings.some((finding) => finding.sev === "deal-breaker")) {
    fallbacks.push({ text: "Validate deal-breaker findings against source documents and size the potential downside." });
  }
  if (findings.some((finding) => finding.sev === "material")) {
    fallbacks.push({ text: "Build mitigation asks for material findings before the next deal team discussion." });
  }
  if (findings.some(isGapFinding)) {
    fallbacks.push({ text: "Request missing VDR materials and unresolved disclosures flagged by the scan." });
  }
  if (findings.some(isInconsistencyFinding)) {
    fallbacks.push({ text: "Reconcile conflicting metrics across the CIM, financials, QoE, and model." });
  }
  if (fallbacks.length === 0 && findings.length > 0) {
    fallbacks.push({ text: "Review scan findings and route each item to the relevant diligence workstream." });
  }
  return fallbacks;
}
