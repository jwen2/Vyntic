import { ddTheme } from "@/components/dd/types";
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn, WorkflowRun } from "@/lib/workflows";
import AnswerText from "@/components/dd/AnswerText";
import CitationSnippet from "@/components/dd/CitationSnippet";
import { ACCENT, AMBER, RED, VIOLET, tint } from "../theme";
import { proseValue } from "../cells/CellRenderer";
import { SectionLabel, RetryIcon } from "./parts";
import { demoteHeadings, formatRunDate } from "./format";
import type { Theme } from "./useTabularRun";

// The right rail: the selected cell's answer + source spans, and recent run
// history.
export default function RunDetailPanel({
  theme,
  run,
  runHistory,
  selectedCell,
  selectedColumn,
  selectedRowLabel,
  activeCitId,
  onCitationClick,
  onRetryCell,
  retrying,
}: {
  theme: Theme;
  run: WorkflowRun | null;
  runHistory: WorkflowRun[];
  selectedCell: TabularCell | null;
  selectedColumn: WorkflowColumn | null;
  selectedRowLabel: string;
  activeCitId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
  onRetryCell: (cellId: string) => void;
  retrying: boolean;
}) {
  const c = ddTheme(theme);
  const citations = selectedCell?.citations ?? [];
  // Prose-shaped columns carry a structured {summary, body, caveats} payload,
  // so their raw `answer` is a JSON blob. Render the parsed body (and surface
  // the caveats) instead of dumping the JSON into the panel. Falls back to
  // parsing `answer` itself when the formatted field isn't populated.
  const rawAnswer = selectedCell?.answer ?? "";
  let shaped: unknown = selectedCell?.answer_formatted;
  if (!isProseShaped(shaped) && rawAnswer.trim().startsWith("{")) {
    try {
      shaped = JSON.parse(rawAnswer);
    } catch {
      /* not JSON — fall through to the raw answer */
    }
  }
  const prose = isProseShaped(shaped) ? proseValue(shaped, rawAnswer) : null;
  const answer = demoteHeadings(prose ? prose.body || prose.summary : rawAnswer).trim();
  const caveats = prose?.caveats ?? [];
  return (
    <aside
      style={{
        borderLeft: `1px solid ${c.border}`,
        background: c.surfaceAlt,
        minHeight: 0,
        overflowY: "auto",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <SectionLabel theme={theme}>Cell Detail</SectionLabel>
        {selectedCell && (
          <button
            type="button"
            onClick={() => !retrying && onRetryCell(selectedCell.id)}
            disabled={retrying}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.t2,
              fontSize: 10,
              fontWeight: 600,
              cursor: retrying ? "wait" : "pointer",
              opacity: retrying ? 0.6 : 1,
            }}
          >
            <RetryIcon spinning={retrying} />
            {retrying ? "Re-running…" : "Rerun cell"}
          </button>
        )}
      </div>
      <div
        style={{
          padding: "12px 14px",
          background: c.surface,
          border: `1px solid ${selectedCell ? tint(ACCENT, 45) : c.border}`,
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <CellSourcesPanel
          theme={theme}
          cell={selectedCell}
          column={selectedColumn}
          rowLabel={selectedRowLabel}
          answer={answer}
          caveats={caveats}
          citations={citations}
          activeCitId={activeCitId}
          onCitationClick={onCitationClick}
        />
      </div>

      <SectionLabel theme={theme}>Run History</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {runHistory.slice(0, 6).map((item) => {
          const current = item.id === run?.id;
          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 6,
                background: current ? c.surface : "transparent",
                border: current ? `1px solid ${c.border}` : "1px solid transparent",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: current ? 700 : 500, color: current ? c.t1 : c.t3 }}>
                Run #{item.run_number}
              </span>
              <span style={{ fontSize: 10, color: c.t3, fontFamily: "var(--font-mono, monospace)" }}>
                {formatRunDate(item.started_at)}
              </span>
            </div>
          );
        })}
        {runHistory.length === 0 && <div style={{ fontSize: 11, color: c.t3 }}>No prior runs.</div>}
      </div>
    </aside>
  );
}

/** True when a value looks like the prose shape ({summary, body, caveats}). */
function isProseShaped(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return "summary" in obj || "body" in obj;
}

function CellSourcesPanel({
  theme,
  cell,
  column,
  rowLabel,
  answer,
  caveats,
  citations,
  activeCitId,
  onCitationClick,
}: {
  theme: Theme;
  cell: TabularCell | null;
  column: WorkflowColumn | null;
  rowLabel: string;
  answer: string;
  caveats: Array<{ text: string; severity: "info" | "warn" | "risk" }>;
  citations: (Citation | null)[];
  activeCitId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
}) {
  const c = ddTheme(theme);
  const nonNullCitations = citations.filter((cite): cite is Citation => cite !== null);

  if (!cell || !column) {
    return (
      <div style={{ fontSize: 12, color: c.t3, lineHeight: 1.5 }}>
        Select a completed cell to inspect extracted text and citations.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 10, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {rowLabel} → {column.label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: c.t1,
          lineHeight: 1.6,
        }}
      >
        {answer ? (
          <AnswerText
            text={answer}
            citations={citations}
            activeCitId={activeCitId}
            onCit={onCitationClick}
          />
        ) : (
          <span style={{ color: c.t3 }}>No answer captured for this cell yet.</span>
        )}
      </div>
      {caveats.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {caveats.map((caveat, index) => {
            const color =
              caveat.severity === "risk" ? RED : caveat.severity === "warn" ? AMBER : ACCENT;
            return (
              <div
                key={`${caveat.severity}_${index}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 7,
                  padding: "6px 9px",
                  borderRadius: 7,
                  background: tint(color, 10),
                  border: `1px solid ${tint(color, 26)}`,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: c.t2,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <span>{caveat.text}</span>
              </div>
            );
          })}
        </div>
      )}
      {nonNullCitations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Source spans
          </div>
          {nonNullCitations.map((cite, index) => {
            const kind = cite.kind ?? "extracted";
            const id = `${cell.id}_source_${index}`;
            const active = activeCitId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onCitationClick(cite, id)}
                style={{
                  textAlign: "left",
                  border: `1px solid ${active ? tint(ACCENT, 55) : c.border}`,
                  borderRadius: 8,
                  background: active ? tint(ACCENT, 10) : c.surfaceAlt,
                  color: c.t1,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 750, color: kind === "derived" ? VIOLET : ACCENT }}>
                    {cite.span_label || `${kind === "derived" ? "Derived" : "Source"} ${index + 1}`}
                  </span>
                  <span style={{ fontSize: 10, color: c.t3, fontFamily: "var(--font-mono, monospace)" }}>
                    p.{cite.page}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 5 }}>
                  {cite.source_file}
                </div>
                <div style={{ fontSize: 11, color: c.t2, lineHeight: 1.45 }}>
                  <CitationSnippet
                    sourceFile={cite.source_file}
                    text={cite.text_snippet || "Open the source document to inspect this span."}
                    variant="viewer"
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: c.t3 }}>No citations captured.</div>
      )}
    </div>
  );
}
