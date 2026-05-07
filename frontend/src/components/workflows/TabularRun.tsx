"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import {
  listDocuments,
  type Citation,
  type DocumentMetadata,
} from "@/lib/api";
import {
  cancelRun,
  downloadRunExport,
  getRun,
  listRuns,
  subscribeRun,
  type CellStatus,
  type RunStatus,
  type RunStreamEvent,
  type TabularCell,
  type WorkflowColumn,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import { getFormatShort } from "@/lib/matrixColumnConfig";
import DocumentViewer from "@/components/DocumentViewer";
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
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([]);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);
  const onCompleteRef = useRef(onComplete);
  const completedFiredRef = useRef(false);
  onCompleteRef.current = onComplete;

  const handleCitationClick = useCallback((citation: Citation, citDealId: string) => {
    setViewerState({
      dealId: citDealId,
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
  }, []);

  const runColumns = useMemo(
    () => workflow.columns.slice().sort((a, b) => a.order_index - b.order_index),
    [workflow.columns]
  );

  useEffect(() => {
    let active = true;
    listRuns(dealId, workflow.id)
      .then((items) => {
        if (active) setRunHistory(items);
      })
      .catch(() => {
        if (active) setRunHistory([]);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflow.id]);

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
  const rowKeys = useMemo(() => {
    if (workflow.row_source === "one_doc_per_row") return documentIds;
    const keys: string[] = [];
    cells.forEach((cell) => {
      if (!keys.includes(cell.row_key)) keys.push(cell.row_key);
    });
    return keys;
  }, [workflow.row_source, documentIds, cells]);
  const totalCells = rowKeys.length * runColumns.length;
  const completeCells = useMemo(() => {
    let count = 0;
    cells.forEach((cell) => {
      if (cell.status === "complete" || cell.status === "error") count += 1;
    });
    return count;
  }, [cells]);
  const selectedCell = useMemo(() => {
    if (!selectedCellKey) return null;
    return cells.get(selectedCellKey) ?? null;
  }, [selectedCellKey, cells]);
  const selectedColumn = useMemo(() => {
    if (!selectedCell) return null;
    return runColumns.find((col) => col.id === selectedCell.column_id) ?? null;
  }, [selectedCell, runColumns]);
  const selectedRowLabel = useMemo(() => {
    if (!selectedCell) return "";
    if (workflow.row_source !== "one_doc_per_row") return selectedCell.row_key;
    return docs.find((doc) => doc.doc_id === selectedCell.row_key)?.filename ?? selectedCell.row_key.slice(0, 8);
  }, [selectedCell, workflow.row_source, docs]);
  const highRiskCount = useMemo(() => {
    let count = 0;
    cells.forEach((cell) => {
      const text = stripSourceMarkers(cell.answer || "").trim();
      if (cell.status === "complete" && /\bhigh\b/i.test(text)) count += 1;
    });
    return count;
  }, [cells]);

  useEffect(() => {
    if (selectedCellKey && cells.has(selectedCellKey)) return;
    for (const rowKey of rowKeys) {
      for (const col of runColumns) {
        const key = cellKey(rowKey, col.id);
        const cell = cells.get(key);
        if (cell?.status === "complete") {
          setSelectedCellKey(key);
          return;
        }
      }
    }
  }, [selectedCellKey, cells, rowKeys, runColumns]);

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

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadRunExport(runId, "xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [runId, exporting]);

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
              {runColumns.length} col{runColumns.length === 1 ? "" : "s"}
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
          {isTerminal && (
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                padding: "5px 10px",
                background: ACCENT,
                border: "none",
                color: "white",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: exporting ? "wait" : "pointer",
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting ? "Exporting..." : "Excel"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr) 340px",
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
            <SummaryCards
              theme={theme}
              documents={documentIds.length}
              completeCells={completeCells}
              totalCells={totalCells}
              highRiskCount={highRiskCount}
              elapsedLabel={elapsedLabel}
              runId={run?.id ?? runId}
            />
            <table
              style={{
                minWidth: Math.max(760, 260 + runColumns.length * 160),
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: 11,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...cellHeaderStyle(c), width: 260, position: "sticky", left: 0, zIndex: 2 }}>Document</th>
                  {runColumns.map((col) => (
                    <th key={col.id} style={cellHeaderStyle(c)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.label}</span>
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
                {rowKeys.map((rowKey) => {
                  const doc = docs.find((d) => d.doc_id === rowKey);
                  return (
                    <tr key={rowKey}>
                      <td style={{ ...cellBodyStyle(c), width: 260, position: "sticky", left: 0, zIndex: 1 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: 500,
                          }}
                          title={workflow.row_source === "one_doc_per_row" ? doc?.filename ?? rowKey : rowKey}
                        >
                          {workflow.row_source === "one_doc_per_row"
                            ? doc?.filename ?? rowKey.slice(0, 8)
                            : rowKey}
                        </div>
                      </td>
                      {runColumns.map((col) => {
                        const cell = cells.get(cellKey(rowKey, col.id));
                        if (cell && cell.status === "complete") {
                          return (
                            <ValueCell
                              key={col.id}
                              cell={cell}
                              column={col}
                              selected={selectedCellKey === cellKey(rowKey, col.id)}
                              onSelect={() => setSelectedCellKey(cellKey(rowKey, col.id))}
                              theme={theme}
                            />
                          );
                        }
                        return (
                          <td key={col.id} style={cellBodyStyle(c)}>
                            <PlaceholderCell cell={cell} theme={theme} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <RunDetailSidebar
          theme={theme}
          run={run}
          runHistory={runHistory}
          selectedCell={selectedCell}
          selectedColumn={selectedColumn}
          selectedRowLabel={selectedRowLabel}
          dealId={dealId}
          onCitationClick={handleCitationClick}
        />
      </div>

      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}
    </div>
  );
}

function ValueCell({
  cell,
  column,
  selected,
  onSelect,
  theme,
}: {
  cell: TabularCell;
  column: WorkflowColumn;
  selected: boolean;
  onSelect: () => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const citations = cell.citations.filter((cite): cite is Citation => cite !== null);
  const display = formatCellValue(cell, column);
  const fullAnswer = stripSourceMarkers(cell.answer).trim();
  const displayText = Array.isArray(display) ? display[0] ?? "" : display;
  const hasSource = displayText !== "" && citations.length > 0;

  return (
    <td
      onClick={onSelect}
      style={{
        ...cellBodyStyle(c),
        padding: "5px 8px",
        fontSize: 11,
        lineHeight: 1.2,
        cursor: "pointer",
        background: selected ? tint(ACCENT, 12) : c.surface,
        boxShadow: selected ? `inset 0 0 0 1px ${tint(ACCENT, 55)}` : undefined,
      }}
      title={fullAnswer || (Array.isArray(display) ? display.join("; ") : display)}
    >
      <DisplayValue value={displayText} column={column} theme={theme} hasSource={hasSource} />
    </td>
  );
}

function DisplayValue({
  value,
  column,
  theme,
  hasSource,
}: {
  value: string;
  column: WorkflowColumn;
  theme: Theme;
  hasSource?: boolean;
}) {
  const c = ddTheme(theme);
  const label = value || "";
  const lower = label.toLowerCase();
  const pill =
    lower === "yes"
      ? { bg: tint(GREEN, 20), fg: GREEN }
      : lower === "no"
        ? { bg: tint(RED, 16), fg: RED }
        : lower === "high"
          ? { bg: tint(RED, 16), fg: RED }
          : lower === "medium"
            ? { bg: tint(AMBER, 16), fg: AMBER }
            : lower === "low"
              ? { bg: tint(GREEN, 20), fg: GREEN }
              : null;
  if (pill && label) {
    return (
      <span
        style={{
          display: "inline-flex",
          maxWidth: "100%",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          background: pill.bg,
          color: pill.fg,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  }
  const muted = !label || lower === "n/a" || lower === "na" || lower === "not disclosed";
  return (
    <span
      style={{
        display: "block",
        color: muted ? c.t3 : c.t1,
        maxWidth: 220,
        minHeight: 13,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontFamily:
          column.format === "number" ||
          column.format === "percentage" ||
          column.format === "monetary_amount"
            ? "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
            : "inherit",
        fontVariantNumeric: "tabular-nums",
        textDecoration: hasSource ? `underline dotted ${tint(ACCENT, 45)}` : "none",
        textUnderlineOffset: 3,
      }}
    >
      {label}
    </span>
  );
}

function SummaryCards({
  theme,
  documents,
  completeCells,
  totalCells,
  highRiskCount,
  elapsedLabel,
  runId,
}: {
  theme: Theme;
  documents: number;
  completeCells: number;
  totalCells: number;
  highRiskCount: number;
  elapsedLabel: string;
  runId: string;
}) {
  const c = ddTheme(theme);
  const cards = [
    { label: "Documents", value: String(documents) },
    { label: "Cells Extracted", value: `${completeCells}/${totalCells}` },
    { label: "High Risk", value: String(highRiskCount), color: highRiskCount > 0 ? RED : c.t1 },
    { label: "Run Time", value: elapsedLabel || "0s" },
    { label: "Run ID", value: runId.slice(0, 8), mono: true },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            minWidth: 104,
            padding: "8px 12px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 9, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, fontWeight: 700 }}>
            {card.label}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: card.color || c.t1,
              fontFamily: card.mono ? "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" : "inherit",
            }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunDetailSidebar({
  theme,
  run,
  runHistory,
  selectedCell,
  selectedColumn,
  selectedRowLabel,
  dealId,
  onCitationClick,
}: {
  theme: Theme;
  run: WorkflowRun | null;
  runHistory: WorkflowRun[];
  selectedCell: TabularCell | null;
  selectedColumn: WorkflowColumn | null;
  selectedRowLabel: string;
  dealId: string;
  onCitationClick: (citation: Citation, dealId: string) => void;
}) {
  const c = ddTheme(theme);
  const citations = selectedCell?.citations.filter((cite): cite is Citation => cite !== null) ?? [];
  const display = selectedCell && selectedColumn ? formatCellValue(selectedCell, selectedColumn) : "";
  const displayText = Array.isArray(display) ? display[0] ?? "" : display;
  const answer = selectedCell ? stripSourceMarkers(selectedCell.answer).trim() : "";
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
      <SectionLabel theme={theme}>Cell Detail</SectionLabel>
      <div
        style={{
          padding: "12px 14px",
          background: c.surface,
          border: `1px solid ${selectedCell ? tint(ACCENT, 45) : c.border}`,
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        {selectedCell && selectedColumn ? (
          <>
            <div style={{ fontSize: 10, color: c.t3, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedRowLabel} → {selectedColumn.label}
            </div>
            <div style={{ marginBottom: 10 }}>
              <DisplayValue value={displayText} column={selectedColumn} theme={theme} />
            </div>
            <div style={{ fontSize: 11, color: c.t2, lineHeight: 1.6, marginBottom: 12 }}>
              {answer || "No answer captured for this cell yet."}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, marginBottom: 7 }}>
              Citations ({citations.length})
            </div>
            {citations.length ? (
              citations.map((cite, index) => (
                <button
                  key={`${cite.source_file}-${cite.page}-${index}`}
                  onClick={() => onCitationClick(cite, cite.deal_id || dealId)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    background: c.bg,
                    border: "none",
                    borderLeft: `3px solid ${ACCENT}`,
                    borderRadius: 6,
                    marginBottom: 7,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 10, color: ACCENT, fontFamily: "var(--font-mono, monospace)", marginBottom: 4 }}>
                    {cite.source_file} · p.{cite.page}
                  </div>
                  <div style={{ fontSize: 11, color: c.t2, lineHeight: 1.5, fontStyle: "italic" }}>
                    {cite.text_snippet || "Open source passage"}
                  </div>
                </button>
              ))
            ) : (
              <div style={{ fontSize: 11, color: c.t3 }}>No citations captured.</div>
            )}
            {citations[0] && (
              <button
                onClick={() => onCitationClick(citations[0], citations[0].deal_id || dealId)}
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  border: `1px solid ${c.border}`,
                  borderRadius: 7,
                  background: c.surfaceAlt,
                  color: c.t1,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Open in Viewer
              </button>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: c.t3, lineHeight: 1.5 }}>
            Select a completed cell to inspect extracted text and citations.
          </div>
        )}
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

function formatCellValue(cell: TabularCell, column: WorkflowColumn): string | string[] {
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

function compactScalar(value: string, format: WorkflowColumn["format"]): string {
  const cleaned = stripSourceMarkers(value).trim();
  if (!cleaned || isMissingValue(cleaned)) return "";

  if (format === "monetary_amount") {
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
  if (format === "yes_no") {
    const first = cleaned.split(/\W+/)[0]?.toLowerCase();
    if (first === "yes") return "Yes";
    if (first === "no") return "No";
    return "";
  }
  if (format === "date") {
    const match = cleaned.match(/\d{4}-\d{2}-\d{2}(?:\s+to\s+\d{4}-\d{2}-\d{2})?/);
    return match?.[0] ?? "";
  }
  return cleaned.split(/\n+/)[0].trim();
}

function isMissingValue(value: string): boolean {
  return /^(not stated|not disclosed|not specified|not provided|not mentioned|not addressed|not available|not found|no relevant|n\/a|unknown|unclear)\b/i.test(
    value.replace(/[.\s]+$/g, "").trim()
  );
}

function stripSourceMarkers(value: string): string {
  return value
    .replace(/\[Source\s+\d+\]/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

function formatRunDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    // checkpoint is unreachable for tabular runs but required by RunStatus.
    checkpoint: { color: AMBER, bg: tint(AMBER, 15), label: "Checkpoint", pulse: true },
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
    padding: "7px 9px",
    borderBottom: `1px solid ${c.border}`,
    borderRight: `1px solid ${c.border}`,
    color: c.t2,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "left",
    whiteSpace: "nowrap",
    background: c.surfaceAlt,
    position: "sticky",
    top: 0,
    zIndex: 1,
  };
}

function cellBodyStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderBottom: `1px solid ${c.border}`,
    borderRight: `1px solid ${c.border}`,
    color: c.t1,
    verticalAlign: "middle",
    height: 38,
    background: c.surface,
  };
}

/** Renders a placeholder for non-complete cells (queued / running / error).
 * Complete cells are delegated to MatrixCell which renders its own <td>. */
function PlaceholderCell({
  cell,
  theme,
}: {
  cell: TabularCell | undefined;
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
      <span
        style={{ color: RED, fontSize: 11, fontWeight: 600 }}
        title={cell.error_message ?? "Error"}
      >
        Error
      </span>
    );
  }
  return null;
}
