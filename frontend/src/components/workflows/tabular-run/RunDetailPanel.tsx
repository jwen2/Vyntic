import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn, WorkflowRun } from "@/lib/workflows";
import AnswerText from "@/components/dd/AnswerText";
import CitationSnippet from "@/components/dd/CitationSnippet";
import { ACCENT, AMBER, RED, VIOLET, tint } from "../theme";
import { proseValue } from "../cells/CellRenderer";
import SectionLabel from "@/components/ui/SectionLabel";
import { RetryIcon } from "./parts";
import { demoteHeadings, formatRunDate } from "./format";

// The right rail: the selected cell's answer + source spans, and recent run
// history.
export default function RunDetailPanel({
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
    <aside className="border-l border-l-edge bg-surface-alt min-h-0 overflow-y-auto p-4">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <SectionLabel>Cell Detail</SectionLabel>
        {selectedCell && (
          <button
            type="button"
            onClick={() => !retrying && onRetryCell(selectedCell.id)}
            disabled={retrying}
            className="inline-flex items-center gap-1 px-2 py-[3px] rounded-md border border-edge bg-surface text-t2 text-[10px] font-semibold"
            style={{
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
        className="px-[14px] py-3 bg-surface border border-edge rounded-[10px] mb-5"
        // A selected cell tints the panel's edge with the accent — a wash, not
        // a token, so it overrides the border-edge class inline.
        style={{ borderColor: selectedCell ? tint(ACCENT, 45) : undefined }}
      >
        <CellSourcesPanel
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

      <SectionLabel>Run History</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {runHistory.slice(0, 6).map((item) => {
          const current = item.id === run?.id;
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between px-[10px] py-2 rounded-md border ${
                current ? "bg-surface border-edge" : "bg-transparent border-transparent"
              }`}
            >
              <span
                className={`text-[11px] ${current ? "font-bold text-t1" : "font-medium text-t3"}`}
              >
                Run #{item.run_number}
              </span>
              <span
                className="text-[10px] text-t3"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                {formatRunDate(item.started_at)}
              </span>
            </div>
          );
        })}
        {runHistory.length === 0 && <div className="text-[11px] text-t3">No prior runs.</div>}
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
  cell,
  column,
  rowLabel,
  answer,
  caveats,
  citations,
  activeCitId,
  onCitationClick,
}: {
  cell: TabularCell | null;
  column: WorkflowColumn | null;
  rowLabel: string;
  answer: string;
  caveats: Array<{ text: string; severity: "info" | "warn" | "risk" }>;
  citations: (Citation | null)[];
  activeCitId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
}) {
  const nonNullCitations = citations.filter((cite): cite is Citation => cite !== null);

  if (!cell || !column) {
    return (
      <div className="text-xs text-t3 leading-normal">
        Select a completed cell to inspect extracted text and citations.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="text-[10px] text-t3 overflow-hidden text-ellipsis whitespace-nowrap">
        {rowLabel} → {column.label}
      </div>
      <div className="text-xs text-t1 leading-[1.6]">
        {answer ? (
          <AnswerText
            text={answer}
            citations={citations}
            activeCitId={activeCitId}
            onCit={onCitationClick}
          />
        ) : (
          <span className="text-t3">No answer captured for this cell yet.</span>
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
                className="flex items-start gap-[7px] px-[9px] py-1.5 rounded-[7px] text-[11.5px] leading-normal text-t2"
                // Severity washes are derived from a status hue, not a token.
                style={{
                  background: tint(color, 10),
                  border: `1px solid ${tint(color, 26)}`,
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
          <div className="text-[10px] font-bold text-t3 uppercase tracking-[0.06em]">
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
                className={`text-left border rounded-lg p-2.5 cursor-pointer text-t1 ${
                  active ? "" : "border-edge bg-surface-alt"
                }`}
                // The active span is an accent wash rather than a token.
                style={{
                  borderColor: active ? tint(ACCENT, 55) : undefined,
                  background: active ? tint(ACCENT, 10) : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span
                    className="text-[11px] font-[750]"
                    style={{ color: kind === "derived" ? VIOLET : ACCENT }}
                  >
                    {cite.span_label || `${kind === "derived" ? "Derived" : "Source"} ${index + 1}`}
                  </span>
                  <span
                    className="text-[10px] text-t3"
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >
                    p.{cite.page}
                  </span>
                </div>
                <div className="text-[10px] text-t3 overflow-hidden text-ellipsis whitespace-nowrap mb-[5px]">
                  {cite.source_file}
                </div>
                <div className="text-[11px] text-t2 leading-[1.45]">
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
        <div className="text-[11px] text-t3">No citations captured.</div>
      )}
    </div>
  );
}
