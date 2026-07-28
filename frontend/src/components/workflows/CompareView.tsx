
import { useEffect, useMemo, useState } from "react";
import type { Citation, DocumentMetadata } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { diffWords, type DiffSegment } from "@/lib/diffWords";
import CellRenderer, {
  proseValue,
  stripSourceMarkers,
  type ProseValue,
} from "./cells/CellRenderer";
import { ACCENT, AMBER, GREEN, RED, VIOLET, tint } from "./theme";
import { Select } from "@/components/ui/Input";

interface CompareViewProps {
  workflowId: string;
  columns: WorkflowColumn[];
  rowKeys: string[];
  cells: Map<string, TabularCell>;
  docs: DocumentMetadata[];
  rowSourceIsDoc: boolean;
  onCitationClick?: (citation: Citation, id: string) => void;
}

type CompareTone = "anchor" | "agree" | "diff" | "missing";

const COL_KEY_PREFIX = "vyntic_workflow_compare_col_";
const ANCHOR_KEY_PREFIX = "vyntic_workflow_compare_anchor_";

const cellKey = (rowKey: string, columnId: string) => `${rowKey}__${columnId}`;

export default function CompareView({
  workflowId,
  columns,
  rowKeys,
  cells,
  docs,
  rowSourceIsDoc,
  onCitationClick,
}: CompareViewProps) {
  const [activeColumnId, setActiveColumnId] = useState<string>(() => {
    if (typeof window === "undefined") return columns[0]?.id ?? "";
    const stored = window.localStorage.getItem(COL_KEY_PREFIX + workflowId);
    if (stored && columns.some((col) => col.id === stored)) return stored;
    return columns[0]?.id ?? "";
  });
  // Keep the active column in sync if columns are added/removed under us.
  useEffect(() => {
    if (columns.length === 0) return;
    if (!columns.some((col) => col.id === activeColumnId)) {
      setActiveColumnId(columns[0].id);
    }
  }, [columns, activeColumnId]);
  useEffect(() => {
    if (!activeColumnId) return;
    try { localStorage.setItem(COL_KEY_PREFIX + workflowId, activeColumnId); } catch {}
  }, [workflowId, activeColumnId]);

  const [anchorRowKey, setAnchorRowKey] = useState<string>(() => {
    if (typeof window === "undefined") return rowKeys[0] ?? "";
    const stored = window.localStorage.getItem(ANCHOR_KEY_PREFIX + workflowId);
    if (stored && rowKeys.includes(stored)) return stored;
    return rowKeys[0] ?? "";
  });
  useEffect(() => {
    if (rowKeys.length === 0) return;
    if (!rowKeys.includes(anchorRowKey)) setAnchorRowKey(rowKeys[0]);
  }, [rowKeys, anchorRowKey]);
  useEffect(() => {
    if (!anchorRowKey) return;
    try { localStorage.setItem(ANCHOR_KEY_PREFIX + workflowId, anchorRowKey); } catch {}
  }, [workflowId, anchorRowKey]);

  const [highlightDiffs, setHighlightDiffs] = useState(true);

  const activeColumn = columns.find((col) => col.id === activeColumnId) ?? null;
  const anchorCell = activeColumn ? cells.get(cellKey(anchorRowKey, activeColumn.id)) ?? null : null;
  const anchorProse = anchorCell ? proseValue(anchorCell.answer_formatted, stripSourceMarkers(anchorCell.answer || "")) : null;

  // Tone derivation per row card. Cheap to compute per render — N is small.
  const toneFor = (rowKey: string, cell: TabularCell | undefined): CompareTone => {
    if (rowKey === anchorRowKey) return "anchor";
    if (!cell || cell.status !== "complete") return "missing";
    if (!anchorProse) return "agree";
    const a = compareableText(anchorProse);
    const o = compareableText(proseValue(cell.answer_formatted, stripSourceMarkers(cell.answer || "")));
    if (!a || !o) return "agree";
    const { stats } = diffWords(a, o);
    return stats.overlap >= 0.85 ? "agree" : "diff";
  };

  const caveatCount = useMemo(() => {
    if (!activeColumn) return 0;
    let total = 0;
    for (const rowKey of rowKeys) {
      const cell = cells.get(cellKey(rowKey, activeColumn.id));
      if (!cell || cell.status !== "complete") continue;
      const pv = proseValue(cell.answer_formatted, stripSourceMarkers(cell.answer || ""));
      total += pv.caveats.filter((cv) => cv.severity === "warn" || cv.severity === "risk").length;
    }
    return total;
  }, [rowKeys, cells, activeColumn]);

  if (!activeColumn) {
    return (
      <div className="text-t3" style={{ padding: 24, fontSize: 12 }}>
        Add a column to this workflow to use Compare.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Column picker */}
      <div
        className="bg-surface-alt border border-edge"
        style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "10px 12px", borderRadius: 8,
        }}
      >
        <span className="text-t3" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Compare column
        </span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {columns.map((col) => {
            const active = col.id === activeColumnId;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => setActiveColumnId(col.id)}
                title={col.prompt || col.label}
                // Active state is an accent tint, not a token — kept inline
                // rather than split across two competing border/bg classes.
                style={{
                  border: `1px solid ${active ? tint(ACCENT, 60) : "var(--border)"}`,
                  background: active ? tint(ACCENT, 18) : "var(--surface)",
                  color: active ? "var(--text-1)" : "var(--text-2)",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-toolbar: anchor + diff toggle + caveat count */}
      <div
        className="bg-surface border border-edge text-t2"
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "8px 12px", borderRadius: 8,
          fontSize: 11,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="text-t3">Anchor:</span>
          <Select
            value={anchorRowKey}
            onChange={(e) => setAnchorRowKey(e.target.value)}
            fieldSize="sm"
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              maxWidth: 260,
            }}
          >
            {rowKeys.map((rk) => (
              <option key={rk} value={rk}>{rowLabel(rk, docs, rowSourceIsDoc)}</option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          onClick={() => setHighlightDiffs((v) => !v)}
          aria-pressed={highlightDiffs}
          className="border border-edge"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: highlightDiffs ? tint(ACCENT, 18) : "var(--surface-alt)",
            color: highlightDiffs ? "var(--text-1)" : "var(--text-2)",
            padding: "3px 8px", borderRadius: 5,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}
        >
          Highlight differences
          <span style={{
            padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700,
            background: highlightDiffs ? ACCENT : "var(--border)",
            color: highlightDiffs ? "white" : "var(--text-3)",
          }}>
            {highlightDiffs ? "On" : "Off"}
          </span>
        </button>
        <div style={{ flex: 1 }} />
        {caveatCount > 0 && (
          <span style={{ color: AMBER, fontWeight: 700 }}>
            ● {caveatCount} caveat{caveatCount === 1 ? "" : "s"} flagged
          </span>
        )}
      </div>

      {/* Cards grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 14,
      }}>
        {rowKeys.map((rowKey) => {
          const cell = cells.get(cellKey(rowKey, activeColumn.id));
          const tone = toneFor(rowKey, cell);
          return (
            <CompareCard
              key={rowKey}
              tone={tone}
              docLabel={rowLabel(rowKey, docs, rowSourceIsDoc)}
              docMeta={docMeta(rowKey, docs, rowSourceIsDoc)}
              cell={cell}
              column={activeColumn}
              anchorProse={anchorProse}
              highlightDiffs={highlightDiffs}
              onCitationClick={onCitationClick}
              citationIdPrefix={`compare_${rowKey}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function CompareCard({
  tone,
  docLabel,
  docMeta,
  cell,
  column,
  anchorProse,
  highlightDiffs,
  onCitationClick,
  citationIdPrefix,
}: {
  tone: CompareTone;
  docLabel: string;
  docMeta: string | null;
  cell: TabularCell | undefined;
  column: WorkflowColumn;
  anchorProse: ProseValue | null;
  highlightDiffs: boolean;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix: string;
}) {
  const tones = toneStyles(tone);
  const isProse = isProseShape(column.format);

  return (
    <div
      className="bg-surface"
      style={{
        border: tones.border,
        borderRadius: 8,
        padding: 14,
        display: "flex", flexDirection: "column", gap: 10,
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="text-t1"
            style={{
              fontSize: 12, fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            title={docLabel}
          >{docLabel}</div>
          {docMeta && <div className="text-t3" style={{ fontSize: 10, marginTop: 2 }}>{docMeta}</div>}
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: 9, fontWeight: 700,
          padding: "2px 6px", borderRadius: 3,
          background: tones.badgeBg, color: tones.badgeFg,
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>{tones.badgeLabel}</span>
      </div>

      {/* Body */}
      {!cell || cell.status !== "complete" ? (
        <PlaceholderBody status={cell?.status ?? "queued"} />
      ) : isProse ? (
        <ProseBody
          cell={cell}
          tone={tone}
          anchorProse={anchorProse}
          highlightDiffs={highlightDiffs}
          onCitationClick={onCitationClick}
          citationIdPrefix={citationIdPrefix}
        />
      ) : (
        <CellRenderer
          cell={cell}
          column={column}
          density="comfortable"
          onCitationClick={onCitationClick}
          citationIdPrefix={citationIdPrefix}
        />
      )}
    </div>
  );
}

function ProseBody({
  cell,
  tone,
  anchorProse,
  highlightDiffs,
  onCitationClick,
  citationIdPrefix,
}: {
  cell: TabularCell;
  tone: CompareTone;
  anchorProse: ProseValue | null;
  highlightDiffs: boolean;
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix: string;
}) {
  const pv = proseValue(cell.answer_formatted, stripSourceMarkers(cell.answer || ""));
  const summary = pv.summary || pv.body;
  const body = pv.body && pv.body !== summary ? pv.body : "";
  const showDiff = highlightDiffs && tone !== "anchor" && anchorProse != null;
  const anchorBody = anchorProse ? compareableText(anchorProse) : "";

  return (
    <>
      {summary && (
        <div
          className="text-t1"
          style={{
            fontSize: 11.5, fontWeight: 500, lineHeight: 1.45,
            paddingBottom: body ? 10 : 0,
            borderBottom: body ? "1px dashed var(--border)" : undefined,
          }}
        >
          {summary}
        </div>
      )}
      {body && (
        <div className="text-t2" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
          {showDiff
            ? renderDiff(diffWords(anchorBody, body).segments)
            : body}
        </div>
      )}
      {pv.caveats.length > 0 && (
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
          {pv.caveats.map((cv, i) => (
            <CaveatRibbon key={`${cv.text}-${i}`} caveat={cv} />
          ))}
        </div>
      )}
      <CitationStrip
        citations={cell.citations}
        onCitationClick={onCitationClick}
        citationIdPrefix={citationIdPrefix}
      />
    </>
  );
}

function renderDiff(segments: DiffSegment[]) {
  return segments.map((seg, i) => {
    if (seg.kind === "match") return <span key={i}>{seg.text}</span>;
    return (
      <span
        key={i}
        style={{
          background: tint(AMBER, 18),
          borderBottom: `2px solid ${AMBER}`,
          padding: "0 1px",
          borderRadius: 2,
        }}
      >
        {seg.text}
      </span>
    );
  });
}

function CaveatRibbon({ caveat }: { caveat: { text: string; severity: "info" | "warn" | "risk" } }) {
  const color = caveat.severity === "risk" ? RED : caveat.severity === "warn" ? AMBER : ACCENT;
  return (
    <div style={{
      padding: "7px 9px", borderRadius: 6,
      background: tint(color, 16), color,
      fontSize: 10.5, fontWeight: 600, lineHeight: 1.4,
      display: "flex", alignItems: "flex-start", gap: 6,
    }}>
      <span aria-hidden>⚠</span>
      <span>{caveat.text}</span>
    </div>
  );
}

function CitationStrip({
  citations,
  onCitationClick,
  citationIdPrefix,
}: {
  citations: (Citation | null)[];
  onCitationClick?: (citation: Citation, id: string) => void;
  citationIdPrefix: string;
}) {
  const real = citations.filter((cit): cit is Citation => cit !== null);
  if (real.length === 0) return null;
  return (
    <div
      className="border-t border-t-edge text-t3"
      style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
        paddingTop: 6,
        fontSize: 10,
      }}
    >
      {real.slice(0, 4).map((cit, i) => {
        const id = `${citationIdPrefix}_${i}`;
        const label = cit.span_label || `${cit.kind === "derived" ? "D" : "S"}${i + 1}`;
        return (
          <button
            key={`${cit.source_file}-${cit.page}-${i}`}
            type="button"
            title={`${cit.source_file} p.${cit.page}`}
            onClick={(e) => { e.stopPropagation(); onCitationClick?.(cit, id); }}
            style={{
              border: "none", background: "transparent", padding: 0,
              fontSize: 10,
              color: cit.kind === "derived" ? VIOLET : ACCENT,
              fontFamily: "var(--font-mono, monospace)",
              fontWeight: 700,
              cursor: onCitationClick ? "pointer" : "default",
            }}
          >
            [{label}] p.{cit.page}
          </button>
        );
      })}
      {real.length > 4 && <span>+{real.length - 4} more</span>}
    </div>
  );
}

function PlaceholderBody({ status }: { status: string }) {
  const label = status === "running" ? "Running…" : status === "error" ? "Failed" : status === "queued" ? "Queued" : "—";
  const color = status === "error" ? RED : "var(--text-3)";
  return (
    <div style={{
      fontSize: 11, color, fontStyle: "italic",
      padding: "16px 0",
    }}>
      {label}
    </div>
  );
}

function compareableText(pv: ProseValue): string {
  // Prefer body for diffing — summary is often a redundant first sentence.
  return (pv.body || pv.summary || "").trim();
}

function isProseShape(format: WorkflowColumn["format"]): boolean {
  return !(
    format === "metric" ||
    format === "number" ||
    format === "percentage" ||
    format === "monetary_amount" ||
    format === "currency" ||
    format === "bool" ||
    format === "yes_no" ||
    format === "enum" ||
    format === "tag" ||
    format === "date" ||
    format === "list" ||
    format === "bulleted_list" ||
    format === "kv"
  );
}

function rowLabel(rowKey: string, docs: DocumentMetadata[], rowSourceIsDoc: boolean): string {
  if (!rowSourceIsDoc) return rowKey;
  return docs.find((d) => d.doc_id === rowKey)?.filename ?? rowKey.slice(0, 8);
}

function docMeta(rowKey: string, docs: DocumentMetadata[], rowSourceIsDoc: boolean): string | null {
  if (!rowSourceIsDoc) return null;
  const doc = docs.find((d) => d.doc_id === rowKey);
  if (!doc) return null;
  return `${doc.page_count} page${doc.page_count === 1 ? "" : "s"}`;
}

function toneStyles(tone: CompareTone) {
  if (tone === "anchor") {
    return {
      border: `1px solid ${tint(ACCENT, 60)}`,
      badgeBg: tint(ACCENT, 18), badgeFg: ACCENT, badgeLabel: "Anchor",
    };
  }
  if (tone === "diff") {
    return {
      border: `1px solid ${tint(AMBER, 40)}`,
      badgeBg: tint(AMBER, 18), badgeFg: AMBER, badgeLabel: "Diverges",
    };
  }
  if (tone === "missing") {
    return {
      border: "1px dashed var(--border)",
      badgeBg: "var(--surface-alt)", badgeFg: "var(--text-3)", badgeLabel: "—",
    };
  }
  return {
    border: "1px solid var(--border)",
    badgeBg: tint(GREEN, 18), badgeFg: GREEN, badgeLabel: "Consistent",
  };
}
