/**
 * Extract structured Findings from a completed `builtin_proactive_scan`
 * workflow run. Replaces the old `extractScanFindings` util which was deleted
 * with the Workstreams tab in PR #80.
 *
 * Strategy:
 *   - The Proactive Scan workflow has six "finding-producing" columns
 *     (hidden financial risks, buried contractual risks, etc.). They're all
 *     `list` shape, so each cell's `answer_formatted.items` is an array of
 *     short bullet strings. We split each cell's items into findings.
 *   - For each item, we try to parse a severity tag (`[DEAL-BREAKER]`,
 *     `[MATERIAL]`, `[NOTEWORTHY]`). If absent, we infer severity from
 *     keywords ("deal-breaker", "critical", "material risk", etc.). Fallback
 *     is `noteworthy`.
 *   - Title = first sentence. Detail = full text. Citation = the cell's first
 *     non-null citation that
 *     matches a `[Source N]` marker in the item text.
 *   - Findings have stable ids based on (severity + first-80-chars) so
 *     re-runs preserve user edits (status/note) for findings that survive
 *     unchanged. See `useFindings.syncScanFindings`.
 */
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import type { Finding, FindingSeverity } from "./types";

// Column labels from `builtin_proactive_scan` whose outputs we mine.
// Other columns (Deal snapshot, Proposed transaction, Investment thesis, etc.)
// are structured fields, not findings — skip them.
const FINDING_COLUMN_LABELS = new Set([
  // Buyout Proactive Scan finding columns
  "Hidden financial risks",
  "Buried contractual & legal risks",
  "Operational vulnerabilities",
  "Data room gaps & omissions",
  "Cross-document inconsistencies",
  "Regulatory & compliance exposure",
  // LP Fund Brief finding columns (builtin_lp_fund_brief)
  "Track record red flags",
  "Off-market or LP-unfavorable terms",
  "Team & key-person risks",
  "Operational & compliance exposure",
  "Data room gaps & omissions",
  "Cross-document inconsistencies",
]);

function shortDocName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").slice(0, 32);
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// Capture explicit severity tags. The LLM-emitted format varies; we accept:
//   [DEAL-BREAKER]   [DEAL BREAKER]   [DEALBREAKER]   [MATERIAL]   [NOTEWORTHY]
// optionally wrapped in `**`.
const SEVERITY_TAG = /(?:\*\*)?\[\s*(DEAL[\s-]?BREAKER|MATERIAL|NOTEWORTHY)\s*\](?:\*\*)?/i;

function tagToSeverity(tag: string): FindingSeverity {
  const normalized = tag.trim().toUpperCase().replace(/\s+/g, "-");
  if (normalized === "DEAL-BREAKER" || normalized === "DEALBREAKER") return "deal-breaker";
  if (normalized === "MATERIAL") return "material";
  return "noteworthy";
}

// Heuristic severity inference when no explicit tag is present.
function inferSeverity(text: string): FindingSeverity {
  const lower = text.toLowerCase();
  if (/\b(deal[\s-]?breaker|critical risk|catastrophic|kills? the deal)\b/.test(lower)) {
    return "deal-breaker";
  }
  if (/\b(material(?:\s+(?:risk|concern|finding|issue))?|significant\s+(?:risk|concern|issue)|high\s+(?:risk|severity)|serious)\b/.test(lower)) {
    return "material";
  }
  return "noteworthy";
}

function cleanText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*[-*•·]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface ListItemShape {
  items?: Array<{ text?: string } | string>;
}

function getListItems(cell: TabularCell): string[] {
  // The list-shape cell has answer_formatted = { items: [{text}], ordered }.
  // Fall back to splitting answer text on newlines if formatted is missing.
  const formatted = cell.answer_formatted as ListItemShape | null;
  if (formatted && Array.isArray(formatted.items)) {
    return formatted.items
      .map((item) => (typeof item === "string" ? item : item?.text ?? ""))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (cell.answer) {
    return cell.answer
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•·]\s+/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function findCitationForItem(itemText: string, citations: (Citation | null)[]): Citation | null {
  const m = itemText.match(/\[Source\s+(\d+)\]/);
  if (!m) return null;
  const idx = parseInt(m[1], 10) - 1;
  return citations[idx] ?? null;
}

function itemToFinding(
  itemText: string,
  columnLabel: string,
  cellCitations: (Citation | null)[],
): Finding | null {
  const cleaned = cleanText(itemText);
  if (!cleaned) return null;

  // Severity: explicit tag wins; otherwise infer from keywords.
  const tagMatch = cleaned.match(SEVERITY_TAG);
  const sev: FindingSeverity = tagMatch
    ? tagToSeverity(tagMatch[1])
    : inferSeverity(cleaned);

  // Strip the severity tag from the title/detail (so it doesn't show twice).
  const display = cleaned.replace(SEVERITY_TAG, "").replace(/^[\s\-—–:]+/, "").trim();
  if (!display) return null;

  const firstSentence = display.split(/(?<=[.!?])\s+/)[0] ?? display;
  const title = firstSentence.trim();
  const detail = display;

  // Citation lookup: find a [Source N] marker in the item, map to the cell's
  // citations array.
  const sourceCitation = findCitationForItem(display, cellCitations);
  const src = sourceCitation
    ? `${shortDocName(sourceCitation.source_file)} · p.${sourceCitation.page}`
    : columnLabel;
  const conf = sourceCitation ? 86 : 68;

  const id = `scan-${djb2(`${sev}:${display.slice(0, 80)}`)}`;

  return {
    id,
    sev,
    title,
    detail,
    src,
    // `ws` is now a free-form string (former WorkstreamId enum dropped in PR
    // #80). We keep "proactive_scan" for grouping consistency with old
    // findings persisted in localStorage.
    ws: "proactive_scan",
    qid: null,
    conf,
    status: null,
    note: null,
    origin: "scan",
    sourceCitation,
    producerId: "proactive_scan",
  };
}

export function extractFindingsFromRun(
  cells: TabularCell[],
  columns: WorkflowColumn[],
): Finding[] {
  const colById = new Map(columns.map((c) => [c.id, c]));
  const out: Finding[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    if (cell.status !== "complete") continue;
    const col = colById.get(cell.column_id);
    if (!col) continue;
    if (!FINDING_COLUMN_LABELS.has(col.label)) continue;

    const items = getListItems(cell);
    for (const item of items) {
      const finding = itemToFinding(item, col.label, cell.citations || []);
      if (!finding) continue;
      if (seen.has(finding.id)) continue;
      seen.add(finding.id);
      out.push(finding);
    }
  }
  return out;
}
