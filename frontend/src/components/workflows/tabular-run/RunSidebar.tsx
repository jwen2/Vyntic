import { ddTheme } from "@/components/dd/types";
import type { DocumentMetadata } from "@/lib/api";
import type { CellStatus, TabularCell, WorkflowColumn } from "@/lib/workflows";
import { AMBER, GREEN, RED } from "../theme";
import { SectionLabel } from "./parts";
import { cellKey, type RunLogEntry, type Theme } from "./useTabularRun";

// The left rail: the per-document roll-up (status derived from its cells) and
// the scrolling run log.
export default function RunSidebar({
  theme,
  documentIds,
  docs,
  runColumns,
  cells,
  log,
}: {
  theme: Theme;
  documentIds: string[];
  docs: DocumentMetadata[];
  runColumns: WorkflowColumn[];
  cells: Map<string, TabularCell>;
  log: RunLogEntry[];
}) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        borderRight: `1px solid ${c.border}`,
        background: c.surfaceAlt,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
        <SectionLabel theme={theme}>Documents ({documentIds.length})</SectionLabel>
      </div>
      <div style={{ padding: "0 8px", overflowY: "auto", flex: "0 1 auto", maxHeight: "55%" }}>
        {documentIds.map((docId) => {
          const doc = docs.find((d) => d.doc_id === docId);
          const docCells = runColumns.map((col) => cells.get(cellKey(docId, col.id)));
          const allDone = docCells.every((cell) => cell?.status === "complete");
          const anyError = docCells.some((cell) => cell?.status === "error");
          const anyRunning = docCells.some((cell) => cell?.status === "running");
          const status: CellStatus = anyError
            ? "error"
            : anyRunning
              ? "running"
              : allDone
                ? "complete"
                : "queued";
          return (
            <div
              key={docId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: 6,
              }}
            >
              <DocStatusIcon status={status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: c.t1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc?.filename ?? docId.slice(0, 8)}
                </div>
                {doc && <div style={{ fontSize: 10, color: c.t3 }}>{doc.page_count} pages</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
        <SectionLabel theme={theme}>Run log</SectionLabel>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0 12px 16px",
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: c.t2,
          lineHeight: 1.55,
        }}
      >
        {log.length === 0 ? (
          <div style={{ color: c.t3 }}>Waiting for events…</div>
        ) : (
          log
            .slice()
            .reverse()
            .map((entry) => (
              <div
                key={entry.id}
                style={{
                  color:
                    entry.level === "ok"
                      ? GREEN
                      : entry.level === "err"
                        ? RED
                        : entry.level === "warn"
                          ? AMBER
                          : c.t2,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {entry.text}
              </div>
            ))
        )}
      </div>
    </div>
  );
}

function DocStatusIcon({ status }: { status: CellStatus }) {
  if (status === "complete") {
    return (
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: GREEN,
          color: "white",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
        }}
      >
        ✓
      </span>
    );
  }
  if (status === "running") {
    return (
      <span
        className="dd-pulse"
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: AMBER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
    );
  }
  if (status === "error") {
    return (
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: RED,
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        !
      </span>
    );
  }
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1px solid currentColor",
        opacity: 0.5,
        display: "inline-block",
      }}
    />
  );
}
