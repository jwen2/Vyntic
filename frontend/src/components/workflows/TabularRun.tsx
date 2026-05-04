"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import { listDocuments, type DocumentMetadata, type Citation } from "@/lib/api";
import {
  cancelRun,
  getRun,
  subscribeRun,
  type CellStatus,
  type RunStatus,
  type RunStreamEvent,
  type TabularCell,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import { getFormatShort, getPillClass, type ColumnFormat } from "@/lib/matrixColumnConfig";
import { ACCENT, AMBER, GREEN, RED, VIOLET, tint } from "./theme";

type Theme = "light" | "dark";

interface TabularRunProps {
  dealId: string;
  runId: string;
  workflow: Workflow;
  theme: Theme;
  onBack: () => void;
  /** Called once when run reaches a terminal state (complete/error/cancelled). */
  onComplete?: (run: WorkflowRun) => void;
}

interface RunLogEntry {
  id: string;
  ts: number;
  level: "info" | "ok" | "warn" | "err";
  text: string;
}

const cellKey = (rowKey: string, columnId: string) => `${rowKey}__${columnId}`;

export default function TabularRun({
  dealId,
  runId,
  workflow,
  theme,
  onBack,
  onComplete,
}: TabularRunProps) {
  const c = ddTheme(theme);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [cells, setCells] = useState<Map<string, TabularCell>>(new Map());
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [log, setLog] = useState<RunLogEntry[]>([]);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const completedFiredRef = useRef(false);
  onCompleteRef.current = onComplete;

  // Filter to extraction columns only — derived columns are stubbed in Phase 2.
  const extractionColumns = useMemo(
    () => workflow.columns.filter((col) => !col.is_derived).sort((a, b) => a.order_index - b.order_index),
    [workflow.columns]
  );

  // Initial document load
  useEffect(() => {
    let active = true;
    listDocuments(dealId)
      .then((items) => {
        if (active) setDocs(items);
      })
      .catch(() => {
        if (active) setDocs([]);
      });
    return () => {
      active = false;
    };
  }, [dealId]);

  // Initial run snapshot (in case the SSE snapshot is delayed)
  useEffect(() => {
    let active = true;
    getRun(runId)
      .then((r) => {
        if (!active) return;
        setRun(r);
        setCells((prev) => {
          const next = new Map(prev);
          for (const cell of r.cells) next.set(cellKey(cell.row_key, cell.column_id), cell);
          return next;
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load run");
      });
    return () => {
      active = false;
    };
  }, [runId]);

  // SSE subscription
  useEffect(() => {
    const appendLog = (level: RunLogEntry["level"], text: string) => {
      setLog((prev) => [
        ...prev.slice(-99),
        { id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, ts: Date.now(), level, text },
      ]);
    };

    const handleEvent = (event: RunStreamEvent) => {
      if (event.type === "snapshot") {
        setRun(event.run);
        setCells((prev) => {
          const next = new Map(prev);
          for (const cell of event.run.cells) {
            next.set(cellKey(cell.row_key, cell.column_id), cell);
          }
          return next;
        });
        appendLog("info", `Snapshot: ${event.run.cells.length} cells, status ${event.run.status}`);
      } else if (event.type === "cell") {
        setCells((prev) => {
          const next = new Map(prev);
          next.set(cellKey(event.cell.row_key, event.cell.column_id), event.cell);
          return next;
        });
        const colLabel = workflow.columns.find((cl) => cl.id === event.cell.column_id)?.label ?? "?";
        const docLabel = docs.find((d) => d.doc_id === event.cell.row_key)?.filename ?? event.cell.row_key.slice(0, 8);
        if (event.cell.status === "running") {
          appendLog("info", `Started ${docLabel} → ${colLabel}`);
        } else if (event.cell.status === "complete") {
          appendLog("ok", `Done ${docLabel} → ${colLabel} (${event.cell.duration_ms}ms)`);
        } else if (event.cell.status === "error") {
          appendLog("err", `Error ${docLabel} → ${colLabel}: ${event.cell.error_message ?? "unknown"}`);
        }
      } else if (event.type === "run") {
        setRun((prev) => (prev ? { ...prev, status: event.status } : prev));
        appendLog(
          event.status === "complete" ? "ok" : event.status === "error" ? "err" : "info",
          `Run ${event.status}`
        );
        if (
          ["complete", "error", "cancelled"].includes(event.status) &&
          !completedFiredRef.current
        ) {
          completedFiredRef.current = true;
          // Re-fetch the canonical run for any stragglers we missed via SSE.
          getRun(runId)
            .then((r) => {
              setRun(r);
              setCells((prev) => {
                const next = new Map(prev);
                for (const cell of r.cells) next.set(cellKey(cell.row_key, cell.column_id), cell);
                return next;
              });
              onCompleteRef.current?.(r);
            })
            .catch(() => {});
        }
      }
    };

    const close = subscribeRun(runId, handleEvent, () => {
      appendLog("warn", "Stream connection error — reconnecting…");
    });
    return close;
  }, [runId, workflow.columns, docs]);

  const documentIds = useMemo(() => run?.document_ids ?? [], [run]);
  const totalCells = documentIds.length * extractionColumns.length;
  const completeCells = useMemo(() => {
    let count = 0;
    cells.forEach((cell) => {
      if (cell.status === "complete" || cell.status === "error") count += 1;
    });
    return count;
  }, [cells]);

  const elapsedLabel = useMemo(() => {
    if (!run) return "";
    const start = new Date(run.started_at).getTime();
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
    const sec = Math.max(0, Math.floor((end - start) / 1000));
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }, [run, completeCells]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const updated = await cancelRun(runId);
      setRun(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }, [runId, cancelling]);

  if (error && !run) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: c.bg,
          color: c.t1,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Couldn't load run</div>
        <div style={{ fontSize: 12, color: c.t2, textAlign: "center", maxWidth: 480 }}>{error}</div>
        <button
          onClick={onBack}
          style={{
            padding: "6px 12px",
            background: ACCENT,
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Back to library
        </button>
      </div>
    );
  }

  const selectedCell = selectedCellId
    ? Array.from(cells.values()).find((cell) => cell.id === selectedCellId) ?? null
    : null;
  const selectedDoc = selectedCell ? docs.find((d) => d.doc_id === selectedCell.row_key) ?? null : null;
  const selectedColumn = selectedCell
    ? workflow.columns.find((cl) => cl.id === selectedCell.column_id) ?? null
    : null;

  const isTerminal = run ? ["complete", "error", "cancelled"].includes(run.status) : false;

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        background: c.bg,
        color: c.t1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Sub-header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: `1px solid ${c.border}`,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <button
            onClick={onBack}
            style={{
              padding: "5px 10px",
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 7,
              color: c.t2,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← Library
          </button>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: c.t1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {workflow.name}
              <span style={{ color: c.t3, fontWeight: 400, marginLeft: 6 }}>
                › Run #{run?.run_number ?? "…"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: c.t3, marginTop: 1 }}>
              {documentIds.length} doc{documentIds.length === 1 ? "" : "s"} ·{" "}
              {extractionColumns.length} col{extractionColumns.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <RunStatusPill status={run?.status ?? "pending"} theme={theme} />
          <span
            style={{
              fontSize: 11,
              color: c.t2,
              fontFamily: "'DM Mono', monospace",
              whiteSpace: "nowrap",
            }}
          >
            {completeCells}/{totalCells} cells · {elapsedLabel}
          </span>
          {!isTerminal && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                padding: "5px 10px",
                background: "transparent",
                border: `1px solid ${c.border}`,
                color: RED,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: cancelling ? "wait" : "pointer",
                opacity: cancelling ? 0.6 : 1,
              }}
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          minHeight: 0,
        }}
      >
        {/* Left: docs + log */}
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
            <SectionLabel theme={theme}>
              Documents ({documentIds.length})
            </SectionLabel>
          </div>
          <div style={{ padding: "0 8px", overflowY: "auto", flex: "0 1 auto", maxHeight: "55%" }}>
            {documentIds.map((docId) => {
              const doc = docs.find((d) => d.doc_id === docId);
              const docCells = extractionColumns.map((col) => cells.get(cellKey(docId, col.id)));
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
                    {doc && (
                      <div style={{ fontSize: 10, color: c.t3 }}>{doc.page_count} pages</div>
                    )}
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

        {/* Right: grid + cell detail */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr>
                  <th style={cellHeaderStyle(c)}>Document</th>
                  {extractionColumns.map((col) => (
                    <th key={col.id} style={cellHeaderStyle(c)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{col.label}</span>
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: tint(VIOLET, 18),
                            color: VIOLET,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {getFormatShort(col.format)}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documentIds.map((docId) => {
                  const doc = docs.find((d) => d.doc_id === docId);
                  return (
                    <tr key={docId}>
                      <td style={cellBodyStyle(c)}>{doc?.filename ?? docId.slice(0, 8)}</td>
                      {extractionColumns.map((col) => {
                        const cell = cells.get(cellKey(docId, col.id));
                        return (
                          <td
                            key={col.id}
                            style={cellBodyStyle(c)}
                            onClick={() => {
                              if (cell?.status === "complete" || cell?.status === "error") {
                                setSelectedCellId(cell.id);
                              }
                            }}
                          >
                            <CellRenderer cell={cell} format={col.format} tags={col.tags ?? null} theme={theme} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedCell && (
            <CellDetailPanel
              cell={selectedCell}
              column={selectedColumn}
              doc={selectedDoc}
              theme={theme}
              onClose={() => setSelectedCellId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── helpers ──

function SectionLabel({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: c.t3,
      }}
    >
      {children}
    </div>
  );
}

function RunStatusPill({ status, theme }: { status: RunStatus; theme: Theme }) {
  const c = ddTheme(theme);
  const map: Record<RunStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
    pending: { color: c.t2, bg: c.surfaceAlt, label: "Pending", pulse: false },
    running: { color: AMBER, bg: tint(AMBER, 15), label: "Running", pulse: true },
    complete: { color: GREEN, bg: tint(GREEN, 15), label: "Complete", pulse: false },
    cancelled: { color: c.t3, bg: c.surfaceAlt, label: "Cancelled", pulse: false },
    error: { color: RED, bg: tint(RED, 15), label: "Error", pulse: false },
  };
  const cfg = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        background: cfg.bg,
        color: cfg.color,
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 99,
      }}
    >
      <span
        className={cfg.pulse ? "dd-pulse" : undefined}
        style={{ width: 6, height: 6, background: cfg.color, borderRadius: "50%" }}
      />
      {cfg.label}
    </span>
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

function cellHeaderStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderBottom: `1px solid ${c.border}`,
    color: c.t2,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "left",
    whiteSpace: "nowrap",
    background: c.surfaceAlt,
  };
}

function cellBodyStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    padding: "10px",
    borderBottom: `1px solid ${c.border}`,
    color: c.t1,
    verticalAlign: "top",
    cursor: "pointer",
  };
}

function CellRenderer({
  cell,
  format,
  tags,
  theme,
}: {
  cell: TabularCell | undefined;
  format: ColumnFormat;
  tags: string[] | null;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  if (!cell || cell.status === "queued") {
    return (
      <div
        style={{
          width: 30,
          height: 6,
          background: c.border,
          borderRadius: 3,
          opacity: 0.3,
        }}
      />
    );
  }
  if (cell.status === "running") {
    return (
      <div
        className="dd-pulse"
        style={{
          width: 40,
          height: 6,
          background: ACCENT,
          borderRadius: 3,
          opacity: 0.5,
        }}
      />
    );
  }
  if (cell.status === "error") {
    return (
      <span style={{ color: RED, fontSize: 11, fontWeight: 600 }}>
        Error
      </span>
    );
  }
  // complete
  return <CompleteCellAnswer cell={cell} format={format} tags={tags} theme={theme} />;
}

function CompleteCellAnswer({
  cell,
  format,
  tags,
  theme,
}: {
  cell: TabularCell;
  format: ColumnFormat;
  tags: string[] | null;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  // Pill-style render for yes_no / tag / currency
  const trimmed = (cell.answer ?? "").trim();
  if (format === "yes_no") {
    const isYes = trimmed.toLowerCase().startsWith("yes");
    const isNo = trimmed.toLowerCase().startsWith("no");
    if (isYes || isNo) {
      const color = isYes ? GREEN : RED;
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            background: tint(color, 18),
            color,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {isYes ? "Yes" : "No"}
        </span>
      );
    }
  }
  if (format === "tag" && tags && tags.length > 0) {
    const matched = tags.find((t) => trimmed.toLowerCase().includes(t.toLowerCase()));
    if (matched) {
      const idx = tags.indexOf(matched);
      const palette = [ACCENT, AMBER, RED, GREEN, VIOLET];
      const color = palette[idx % palette.length];
      return (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            background: tint(color, 18),
            color,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {matched}
        </span>
      );
    }
  }
  // Default: clamped text with dotted underline
  return (
    <span
      style={{
        fontSize: 11,
        color: c.t1,
        borderBottom: `1px dotted ${c.t3}`,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={trimmed}
    >
      {trimmed || <span style={{ color: c.t3 }}>—</span>}
    </span>
  );
}

function CellDetailPanel({
  cell,
  column,
  doc,
  theme,
  onClose,
}: {
  cell: TabularCell;
  column: { label: string; format: ColumnFormat; tags?: string[] | null } | null;
  doc: DocumentMetadata | null;
  theme: Theme;
  onClose: () => void;
}) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        borderTop: `1px solid ${c.border}`,
        background: c.surface,
        padding: "14px 24px 18px",
        maxHeight: "40%",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {doc?.filename ?? cell.row_key.slice(0, 8)} → {column?.label ?? cell.column_id.slice(0, 8)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.t1, marginTop: 4, whiteSpace: "pre-wrap" }}>
            {cell.answer || "—"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: "3px 10px",
            background: "transparent",
            border: `1px solid ${c.border}`,
            color: c.t2,
            borderRadius: 6,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
      {cell.status === "error" && cell.error_message && (
        <div
          style={{
            background: tint(RED, 12),
            border: `1px solid ${tint(RED, 30)}`,
            color: RED,
            fontSize: 11,
            padding: 10,
            borderRadius: 7,
            marginBottom: 10,
          }}
        >
          {cell.error_message}
        </div>
      )}
      {cell.citations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cell.citations.map((cit, i) =>
            cit ? <CitationBlock key={i} citation={cit} theme={theme} /> : null
          )}
        </div>
      )}
      {cell.duration_ms > 0 && (
        <div
          style={{
            marginTop: 10,
            fontSize: 10,
            color: c.t3,
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {cell.duration_ms}ms · {cell.model || "model unknown"}{cell.fallback ? " (fallback)" : ""}
        </div>
      )}
    </div>
  );
}

function CitationBlock({ citation, theme }: { citation: Citation; theme: Theme }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        borderLeft: `3px solid ${ACCENT}`,
        background: tint(ACCENT, 8),
        padding: "8px 12px",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: ACCENT,
          fontFamily: "'DM Mono', monospace",
          marginBottom: 4,
        }}
      >
        {citation.source_file} · p.{citation.page}
      </div>
      <div style={{ fontSize: 11, color: c.t2, fontStyle: "italic", lineHeight: 1.5 }}>
        {citation.text_snippet}
      </div>
    </div>
  );
}
