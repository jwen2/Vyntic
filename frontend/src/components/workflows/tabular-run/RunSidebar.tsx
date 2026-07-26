import type { DocumentMetadata } from "@/lib/api";
import type { CellStatus, TabularCell, WorkflowColumn } from "@/lib/workflows";
import { AMBER, GREEN, RED } from "../theme";
import SectionLabel from "@/components/ui/SectionLabel";
import { cellKey, type RunLogEntry } from "./useTabularRun";

// The left rail: the per-document roll-up (status derived from its cells) and
// the scrolling run log.
export default function RunSidebar({
  documentIds,
  docs,
  runColumns,
  cells,
  log,
}: {
  documentIds: string[];
  docs: DocumentMetadata[];
  runColumns: WorkflowColumn[];
  cells: Map<string, TabularCell>;
  log: RunLogEntry[];
}) {
  return (
    <div className="flex flex-col min-h-0 border-r border-r-edge bg-surface-alt">
      <div style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
        <SectionLabel>Documents ({documentIds.length})</SectionLabel>
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
                <div className="text-xs font-medium text-t1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {doc?.filename ?? docId.slice(0, 8)}
                </div>
                {doc && <div className="text-[10px] text-t3">{doc.page_count} pages</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
        <SectionLabel>Run log</SectionLabel>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 text-[10px] text-t2 leading-[1.55]"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {log.length === 0 ? (
          <div className="text-t3">Waiting for events…</div>
        ) : (
          log
            .slice()
            .reverse()
            .map((entry) => (
              // Level hues are status colors, not surface tokens, so they stay
              // inline; the default level falls through to the t2 class.
              <div
                key={entry.id}
                className="text-t2 whitespace-pre-wrap break-words"
                style={{
                  color:
                    entry.level === "ok"
                      ? GREEN
                      : entry.level === "err"
                        ? RED
                        : entry.level === "warn"
                          ? AMBER
                          : undefined,
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
          background: "var(--danger-tint)",
          color: RED,
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
