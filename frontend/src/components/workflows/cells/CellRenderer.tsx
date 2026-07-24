
import type React from "react";
import AnswerText from "@/components/dd/AnswerText";
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { ACCENT, AMBER, GREEN, RED, VIOLET, tint } from "../theme";
import { demoteHeadings } from "../tabular-run/format";

function noopCit() {}

export type CellDensity = "compact" | "comfortable";

interface CellRendererProps {
  cell: TabularCell;
  column: WorkflowColumn;
  density?: CellDensity;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}

type AnyRecord = Record<string, unknown>;

export default function CellRenderer({
  cell,
  column,
  density = "comfortable",
  onCitationClick,
  citationIdPrefix,
}: CellRendererProps) {
  const formatted = cell.answer_formatted;
  const raw = stripSourceMarkers(cell.answer || "").trim();
  const shape = normalizeFormat(column.format);

  if (cell.status === "error") {
    return <EmptyCell reason="Error" tone="error" />;
  }
  if (!raw && formatted == null) {
    return <EmptyCell reason={cell.status === "complete" ? "Out of scope" : "—"} />;
  }

  if (shape === "metric") {
    return <MetricCell value={metricValue(formatted, raw)} citations={cell.citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  if (shape === "date") {
    return <DateCell value={dateValue(formatted, raw)} citations={cell.citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  if (shape === "bool") {
    return <BoolCell value={boolValue(formatted, raw)} citations={cell.citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  if (shape === "enum") {
    return <EnumCell value={enumValue(formatted, raw)} citations={cell.citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  if (shape === "list") {
    return <ListCell value={listValue(formatted, raw)} citations={cell.citations} density={density} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  if (shape === "kv") {
    return <KVCell value={kvValue(formatted, raw)} citations={cell.citations} density={density} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  if (shape === "markdown") {
    return <MarkdownCell value={proseValue(formatted, raw)} citations={cell.citations} density={density} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
  }
  return <ProseCell value={proseValue(formatted, raw)} citations={cell.citations} density={density} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />;
}

function MetricCell({
  value,
  citations,
  onCitationClick,
  citationIdPrefix,
}: {
  value: { value: string; unit?: string; period?: string } | null;
  citations: (Citation | null)[];
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}) {
  if (!value || !value.value) return <EmptyCell reason="Out of scope" />;
  return (
    <div className={cellShellClass}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
        <span
          className="text-t1 text-[15px] font-extrabold tabular-nums"
          style={{ fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}
        >
          {value.value}
        </span>
        {value.unit && (
          <span className="text-t3 text-[10px]" style={{ fontFamily: "var(--font-mono, monospace)" }}>
            {value.unit}
          </span>
        )}
      </div>
      {value.period && <div className="text-t3 text-[9.5px]">{value.period}</div>}
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function DateCell({ value, citations, onCitationClick, citationIdPrefix }: { value: string; citations: (Citation | null)[]; onCitationClick?: (citation: Citation, id: string) => void; citationIdPrefix?: string }) {
  if (!value) return <EmptyCell reason="Out of scope" />;
  return (
    <div className={cellShellClass}>
      <span
        className="self-start text-[10.5px] px-[7px] py-[3px] rounded-[5px] border border-edge text-t1 tabular-nums"
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        {formatDateLabel(value)}
      </span>
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function BoolCell({ value, citations, onCitationClick, citationIdPrefix }: { value: boolean | null; citations: (Citation | null)[]; onCitationClick?: (citation: Citation, id: string) => void; citationIdPrefix?: string }) {
  if (value == null) return <EmptyCell reason="Out of scope" />;
  const color = value ? GREEN : RED;
  return (
    <div className={cellShellClass}>
      <span
        className="self-start px-2 py-0.5 rounded text-[10px] font-extrabold"
        // A status hue, not a token — background/text stay inline.
        style={{ background: tint(color, 18), color }}
      >
        {value ? "Yes" : "No"}
      </span>
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function EnumCell({ value, citations, onCitationClick, citationIdPrefix }: { value: string; citations: (Citation | null)[]; onCitationClick?: (citation: Citation, id: string) => void; citationIdPrefix?: string }) {
  if (!value) return <EmptyCell reason="Out of scope" />;
  const tone = /high|risk|aggressive/i.test(value) ? RED : /medium|mixed/i.test(value) ? AMBER : /low|strong/i.test(value) ? GREEN : VIOLET;
  return (
    <div className={cellShellClass}>
      <span
        className="self-start max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-extrabold"
        style={{ background: tint(tone, 18), color: tone }}
      >
        {value}
      </span>
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function ProseCell({
  value,
  citations,
  density,
  onCitationClick,
  citationIdPrefix,
}: {
  value: { summary: string; body: string; caveats: Array<{ text: string; severity: "info" | "warn" | "risk" }> };
  citations: (Citation | null)[];
  density: CellDensity;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}) {
  if (!value.summary && !value.body) return <EmptyCell reason="Out of scope" />;
  return (
    <div className={cellShellClass}>
      <div
        className="text-t1 text-[11.5px] leading-[1.45]"
        style={{
          whiteSpace: density === "compact" ? "nowrap" : "normal",
          overflow: density === "compact" ? "hidden" : "visible",
          textOverflow: density === "compact" ? "ellipsis" : undefined,
        }}
      >
        {value.summary || value.body}
      </div>
      {value.caveats.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {value.caveats.slice(0, density === "compact" ? 1 : 3).map((caveat, index) => (
            <CaveatChip key={`${caveat.text}-${index}`} caveat={caveat} />
          ))}
        </div>
      )}
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

/**
 * "markdown"-format cells (LP DDQ-style multi-section answers: headings,
 * bullet lists, inline [Source N] citations). Unlike ProseCell's fallback —
 * built for short single-sentence answers, where showing only the "first
 * sentence" is fine — these answers have no length constraint, so we always
 * render the full body through AnswerText (the app's markdown+citation
 * renderer, already used for this exact shape of text in RunDetailPanel and
 * DocMatrixCell) rather than truncate it. Headings are demoted to bold text
 * (see RunDetailPanel) so they don't render as oversized <h1-6> in a compact
 * grid cell; density controls how many lines show before clamping — clicking
 * the cell still opens the full, unclamped text in the Cell Detail panel.
 */
function MarkdownCell({
  value,
  citations,
  density,
  onCitationClick,
  citationIdPrefix,
}: {
  value: { summary: string; body: string; caveats: Array<{ text: string; severity: "info" | "warn" | "risk" }> };
  citations: (Citation | null)[];
  density: CellDensity;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}) {
  const text = value.body || value.summary;
  if (!text) return <EmptyCell reason="Out of scope" />;
  return (
    <div className={cellShellClass}>
      <div
        className="text-t1 text-[11.5px] leading-[1.45] overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: density === "compact" ? 2 : 6,
        }}
      >
        <AnswerText
          text={demoteHeadings(text)}
          citations={citations}
          activeCitId={null}
          onCit={onCitationClick ?? noopCit}
        />
      </div>
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function ListCell({
  value,
  citations,
  density,
  onCitationClick,
  citationIdPrefix,
}: {
  value: { items: Array<{ text: string }>; ordered: boolean };
  citations: (Citation | null)[];
  density: CellDensity;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}) {
  if (value.items.length === 0) return <EmptyCell reason="No items found" />;
  const visibleItems = density === "compact" ? value.items.slice(0, 1) : value.items.slice(0, 5);
  return (
    <div className={cellShellClass}>
      <div className="text-t3 text-[9.5px] font-extrabold uppercase tracking-[0.05em]">
        {value.items.length} item{value.items.length === 1 ? "" : "s"}
      </div>
      {visibleItems.map((item, index) => (
        <div key={`${item.text}-${index}`} className="flex gap-1.5 text-t1 text-[11px] leading-[1.35]">
          <span style={{ color: AMBER, flexShrink: 0 }}>{value.ordered ? `${index + 1}.` : "•"}</span>
          <span>{item.text}</span>
        </div>
      ))}
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function KVCell({
  value,
  citations,
  density,
  onCitationClick,
  citationIdPrefix,
}: {
  value: { pairs: Array<{ key: string; value: string | number; unit?: string }> };
  citations: (Citation | null)[];
  density: CellDensity;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}) {
  if (value.pairs.length === 0) return <EmptyCell reason="Out of scope" />;
  const visiblePairs = value.pairs.slice(0, density === "compact" ? 1 : 6);
  return (
    <div className={cellShellClass}>
      {visiblePairs.map((pair, index) => (
        <div key={`${pair.key}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(48px, 0.75fr) minmax(64px, 1fr)", gap: 8, alignItems: "baseline", fontSize: 10.5, lineHeight: 1.35 }}>
          <span className="text-t3 overflow-hidden text-ellipsis whitespace-nowrap">{pair.key}</span>
          <span className="text-t1 text-right tabular-nums" style={{ fontFamily: "var(--font-mono, monospace)" }}>
            {[pair.value, pair.unit].filter(Boolean).join(" ")}
          </span>
        </div>
      ))}
      <CitationRow citations={citations} onCitationClick={onCitationClick} citationIdPrefix={citationIdPrefix} />
    </div>
  );
}

function EmptyCell({ reason, tone }: { reason: string; tone?: "error" }) {
  return (
    <div
      className={`${cellShellBase} justify-center min-h-[40px]`}
      style={{ background: "rgba(255,255,255,0.012)" }}
    >
      <span
        className={`self-start text-[10px] px-1.5 py-0.5 rounded ${tone === "error" ? "" : "text-t4"}`}
        // The error tone is a status hue, not a token.
        style={{ color: tone === "error" ? RED : undefined, fontStyle: tone === "error" ? "normal" : "italic" }}
      >
        {reason}
      </span>
    </div>
  );
}

function CitationRow({
  citations,
  onCitationClick,
  citationIdPrefix = "cell",
}: {
  citations: (Citation | null)[];
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix?: string;
}) {
  const real = citations.filter((citation): citation is Citation => citation !== null);
  if (real.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 1 }}>
      {real.slice(0, 4).map((citation, index) => {
        const id = `${citationIdPrefix}_${index}`;
        const label = citation.span_label || `${citation.kind === "derived" ? "D" : "S"}${index + 1}`;
        const style: React.CSSProperties = {
          border: "none",
          background: "transparent",
          padding: 0,
          fontSize: 9,
          color: citation.kind === "derived" ? VIOLET : ACCENT,
          fontFamily: "var(--font-mono, monospace)",
          fontWeight: 700,
          cursor: onCitationClick ? "pointer" : "default",
        };
        return onCitationClick ? (
          <button
            key={`${citation.source_file}-${citation.page}-${index}`}
            type="button"
            style={style}
            title={`${citation.source_file} p.${citation.page}`}
            onClick={(event) => {
              event.stopPropagation();
              onCitationClick(citation, id);
            }}
          >
            [{label}]
          </button>
        ) : (
          <span key={`${citation.source_file}-${citation.page}-${index}`} style={style}>
            [{label}]
          </span>
        );
      })}
      {real.length > 4 && <span className="text-t3" style={{ fontSize: 9 }}>+{real.length - 4}</span>}
    </div>
  );
}

function CaveatChip({ caveat }: { caveat: { text: string; severity: "info" | "warn" | "risk" } }) {
  const color = caveat.severity === "risk" ? RED : caveat.severity === "warn" ? AMBER : ACCENT;
  return (
    <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9.5, padding: "2px 6px", borderRadius: 4, background: tint(color, 16), color, fontWeight: 750 }}>
      {caveat.text}
    </span>
  );
}

// Shared cell-body chrome. `cellShellBase` omits min-height so EmptyCell can
// use its own (shorter) value without two competing `min-h-*` utilities in
// one class string — Tailwind utilities win by stylesheet order, not string
// order, so there is no "last one wins" here.
const cellShellBase = "px-2.5 py-2 flex flex-col gap-1 text-t1 overflow-hidden";
const cellShellClass = `${cellShellBase} min-h-[42px]`;

function normalizeFormat(format: WorkflowColumn["format"]): "metric" | "date" | "bool" | "enum" | "prose" | "list" | "kv" | "markdown" {
  if (format === "metric" || format === "number" || format === "percentage" || format === "monetary_amount" || format === "currency") return "metric";
  if (format === "bool" || format === "yes_no") return "bool";
  if (format === "enum" || format === "tag") return "enum";
  if (format === "list" || format === "bulleted_list") return "list";
  if (format === "kv") return "kv";
  if (format === "date") return "date";
  // "markdown" columns are unconstrained (backend's parse_answer has no
  // branch for this format, so answer_formatted is always null) — they carry
  // real multi-section markdown (headings, bullet lists, inline [Source N]
  // citations) and need actual markdown rendering, not the generic prose
  // fallback's "first sentence" truncation (that's built for short,
  // single-sentence answers and would silently drop most of the content).
  if (format === "markdown") return "markdown";
  return "prose";
}

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : null;
}

function metricValue(formatted: unknown, raw: string): { value: string; unit?: string; period?: string } | null {
  const obj = asRecord(formatted);
  if (obj && typeof obj.value === "number") {
    return { value: Number.isInteger(obj.value) ? String(obj.value) : String(obj.value), unit: str(obj.unit), period: str(obj.period) };
  }
  if (typeof formatted === "number") return { value: String(formatted) };
  if (!raw || isMissing(raw)) return null;
  const match = raw.match(/(?:[$€£¥]\s*|(?:USD|EUR|GBP|JPY|CAD|AUD|CNY|CHF|HKD|INR|SGD)\s*)?-?\d[\d,]*(?:\.\d+)?\s*(?:[kKmMbB%]|x|turns?)?/);
  return match ? { value: match[0].trim() } : { value: raw.split(/\n+/)[0] };
}

function dateValue(formatted: unknown, raw: string): string {
  const obj = asRecord(formatted);
  if (obj && typeof obj.iso === "string") return obj.iso;
  if (typeof formatted === "string") return formatted;
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? raw.split(/\n+/)[0] ?? "";
}

function boolValue(formatted: unknown, raw: string): boolean | null {
  const obj = asRecord(formatted);
  if (obj && typeof obj.value === "boolean") return obj.value;
  if (typeof formatted === "boolean") return formatted;
  const first = raw.split(/\W+/)[0]?.toLowerCase();
  if (first === "yes") return true;
  if (first === "no") return false;
  return null;
}

function enumValue(formatted: unknown, raw: string): string {
  const obj = asRecord(formatted);
  if (obj && typeof obj.value === "string") return obj.value;
  if (typeof formatted === "string") return formatted.trim();
  return isMissing(raw) ? "" : raw.split(/\n+/)[0].trim();
}

export type ProseValue = { summary: string; body: string; caveats: Array<{ text: string; severity: "info" | "warn" | "risk" }> };

export function proseValue(formatted: unknown, raw: string): ProseValue {
  const obj = asRecord(formatted);
  if (obj && ("summary" in obj || "body" in obj)) {
    return {
      summary: str(obj.summary) || firstSentence(str(obj.body)),
      body: str(obj.body) || str(obj.summary),
      caveats: Array.isArray(obj.caveats)
        ? obj.caveats.map(normalizeCaveat).filter((v): v is { text: string; severity: "info" | "warn" | "risk" } => Boolean(v))
        : [],
    };
  }
  return { summary: firstSentence(raw), body: raw, caveats: [] };
}

function listValue(formatted: unknown, raw: string): { items: Array<{ text: string }>; ordered: boolean } {
  const obj = asRecord(formatted);
  if (obj && Array.isArray(obj.items)) {
    return { items: obj.items.map(normalizeListItem).filter((v): v is { text: string } => Boolean(v)), ordered: Boolean(obj.ordered) };
  }
  if (Array.isArray(formatted)) return { items: formatted.map((item) => ({ text: stripSourceMarkers(String(item)) })).filter((item) => item.text), ordered: false };
  const items = raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
  return { items, ordered: /^\s*\d+\./m.test(raw) };
}

function kvValue(formatted: unknown, raw: string): { pairs: Array<{ key: string; value: string | number; unit?: string }> } {
  const obj = asRecord(formatted);
  if (obj && Array.isArray(obj.pairs)) {
    return { pairs: obj.pairs.map(normalizePair).filter((v): v is { key: string; value: string | number; unit?: string } => Boolean(v)) };
  }
  const pairs = raw
    .split(/;|\n/)
    .map((part) => {
      const [key, ...rest] = part.split(":");
      const value = rest.join(":").trim();
      return key.trim() && value ? { key: key.trim(), value } : null;
    })
    .filter((v): v is { key: string; value: string } => Boolean(v));
  return { pairs };
}

function normalizeListItem(item: unknown): { text: string } | null {
  if (typeof item === "string") {
    const text = stripSourceMarkers(item);
    return text ? { text } : null;
  }
  const obj = asRecord(item);
  const text = stripSourceMarkers(str(obj?.text));
  return text ? { text } : null;
}

function normalizePair(item: unknown): { key: string; value: string | number; unit?: string } | null {
  const obj = asRecord(item);
  if (!obj) return null;
  const key = str(obj.key);
  const value = obj.value;
  if (!key || (typeof value !== "string" && typeof value !== "number")) return null;
  const unit = str(obj.unit);
  return unit ? { key, value, unit } : { key, value };
}

function normalizeCaveat(item: unknown): { text: string; severity: "info" | "warn" | "risk" } | null {
  const obj = asRecord(item);
  if (!obj) return null;
  const text = str(obj.text);
  const severity = str(obj.severity);
  if (!text) return null;
  return { text, severity: severity === "warn" || severity === "risk" ? severity : "info" };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function stripSourceMarkers(value: string): string {
  return value.replace(/\[Source\s+\d+\]/gi, "").trim();
}

function firstSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? cleaned;
}

function isMissing(value: string): boolean {
  return /^(not stated|not disclosed|not specified|not provided|not mentioned|not addressed|not available|not found|no relevant|n\/a|unknown|unclear)\b/i.test(value.trim());
}

function formatDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
