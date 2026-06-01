
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  patchWorkflowColumn,
  retryCell as retryCellApi,
  retryColumn as retryColumnApi,
  subscribeRun,
  type CellStatus,
  type RunStatus,
  type RunStreamEvent,
  type TabularCell,
  type WorkflowColumn,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import {
  PE_COLUMN_PRESETS,
  buildFallbackPrompt,
  getFormatShort,
  getPresetConfig,
  type ColumnFormat,
} from "@/lib/matrixColumnConfig";
import AnswerText from "@/components/dd/AnswerText";
import CitationSnippet from "@/components/dd/CitationSnippet";
import ConfirmDialog from "@/components/ConfirmDialog";
import DocumentViewer from "@/components/DocumentViewer";
import { ACCENT, AMBER, GREEN, RED, VIOLET, tint } from "./theme";
import CellRenderer, { type CellDensity } from "./cells/CellRenderer";
import CompareView from "./CompareView";

type WorkflowView = "compact" | "comfortable" | "compare";
import {
  CellRenderPreview,
  ShapeOptionsInspector,
  ShapePicker,
  detectShape,
} from "./cells/ShapeControls";

type Theme = "light" | "dark";

interface TabularRunProps {
  dealId: string;
  runId: string;
  workflow: Workflow;
  theme: Theme;
  onBack: () => void;
  /** Called once when run reaches a terminal state (complete/error/cancelled). */
  onComplete?: (run: WorkflowRun) => void;
  /** Bubbled up so the parent's workflow list can refresh after a column edit. */
  onWorkflowChange?: (workflow: Workflow) => void;
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
  workflow: workflowProp,
  theme,
  onBack,
  onComplete,
  onWorkflowChange,
}: TabularRunProps) {
  const c = ddTheme(theme);
  const [workflow, setWorkflow] = useState<Workflow>(workflowProp);
  useEffect(() => setWorkflow(workflowProp), [workflowProp]);
  const onWorkflowChangeRef = useRef(onWorkflowChange);
  onWorkflowChangeRef.current = onWorkflowChange;

  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [cells, setCells] = useState<Map<string, TabularCell>>(new Map());
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [log, setLog] = useState<RunLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([]);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [activeCitId, setActiveCitId] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);
  const WIDTH_KEY = `vyntic_workflow_widths_${workflow.id}`;
  const VIEW_KEY = `vyntic_workflow_density_${workflow.id}`;
  const [view, setView] = useState<WorkflowView>(() => {
    if (typeof window === "undefined") return "comfortable";
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (raw === "compact" || raw === "comfortable" || raw === "compare") return raw;
    // Migrate legacy "reader" — Compare replaces it.
    return "comfortable";
  });
  const density: CellDensity = view === "compare" ? "comfortable" : view;
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(WIDTH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {}
    return {};
  });
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const [pendingColumnRetry, setPendingColumnRetry] = useState<{
    columnId: string;
    label: string;
  } | null>(null);
  const [retryingCellIds, setRetryingCellIds] = useState<Set<string>>(new Set());
  const onCompleteRef = useRef(onComplete);
  const completedFiredRef = useRef(false);
  onCompleteRef.current = onComplete;

  const COL_DOC = 260;
  const COL_DEFAULT = 200;
  const MIN_COL_WIDTH = 140;
  const MAX_COL_WIDTH = 1200;

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths, WIDTH_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {}
  }, [view, VIEW_KEY]);

  const getColWidth = useCallback(
    (key: string, fallback: number) => colWidths[key] ?? fallback,
    [colWidths]
  );

  const startColResize = useCallback(
    (e: React.MouseEvent, key: string, startWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      setResizingKey(key);
      const onMove = (mv: MouseEvent) => {
        const delta = mv.clientX - startX;
        const next = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startWidth + delta));
        setColWidths((prev) => ({ ...prev, [key]: next }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setResizingKey(null);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    []
  );

  const handleCitationClick = useCallback(
    (citation: Citation, citId: string) => {
      setActiveCitId(citId);
      setViewerState({
        dealId: citation.deal_id || dealId,
        filename: citation.source_file,
        page: citation.page,
        snippet: citation.text_snippet || "",
      });
    },
    [dealId]
  );

  const runColumns = useMemo(
    () => workflow.columns.slice().sort((a, b) => a.order_index - b.order_index),
    [workflow.columns]
  );

  const handleRetryCell = useCallback(
    async (cellId: string) => {
      setRetryingCellIds((prev) => {
        const next = new Set(prev);
        next.add(cellId);
        return next;
      });
      try {
        await retryCellApi(runId, cellId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Retry failed");
      } finally {
        setRetryingCellIds((prev) => {
          const next = new Set(prev);
          next.delete(cellId);
          return next;
        });
      }
    },
    [runId]
  );

  const handleRetryColumn = useCallback(
    async (columnId: string) => {
      try {
        await retryColumnApi(runId, columnId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Column retry failed");
      }
    },
    [runId]
  );

  const handleSaveColumn = useCallback(
    async (columnId: string, patch: { label: string; prompt: string; format: ColumnFormat; tags: string[] }): Promise<{ promptChanged: boolean }> => {
      const current = workflow.columns.find((col) => col.id === columnId);
      if (!current) return { promptChanged: false };
      const promptChanged = current.prompt.trim() !== patch.prompt.trim();
      const updated = await patchWorkflowColumn(dealId, workflow.id, columnId, {
        label: patch.label,
        prompt: patch.prompt,
        format: patch.format,
        tags: patch.format === "tag" || patch.format === "enum" ? patch.tags : null,
      });
      const nextWorkflow: Workflow = {
        ...workflow,
        columns: workflow.columns.map((col) =>
          col.id === columnId
            ? {
                ...col,
                label: updated.label,
                prompt: updated.prompt,
                format: updated.format,
                tags: updated.tags ?? null,
              }
            : col
        ),
      };
      setWorkflow(nextWorkflow);
      onWorkflowChangeRef.current?.(nextWorkflow);
      return { promptChanged };
    },
    [workflow, dealId]
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
          <ViewSwitcher value={view} onChange={setView} theme={theme} />
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
            {view === "compare" ? (
              <CompareView
                workflowId={workflow.id}
                columns={runColumns}
                rowKeys={rowKeys}
                cells={cells}
                docs={docs}
                rowSourceIsDoc={workflow.row_source === "one_doc_per_row"}
                theme={theme}
                onCitationClick={handleCitationClick}
              />
            ) : (
            <table
              style={{
                width:
                  getColWidth("doc", COL_DOC) +
                  runColumns.reduce((sum, col) => sum + getColWidth(col.id, COL_DEFAULT), 0),
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: 11,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
              }}
            >
              <colgroup>
                <col style={{ width: getColWidth("doc", COL_DOC) }} />
                {runColumns.map((col) => (
                  <col key={col.id} style={{ width: getColWidth(col.id, COL_DEFAULT) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={cellHeaderStyle(c)}>
                    Document
                    <ColResizeHandle
                      active={resizingKey === "doc"}
                      onMouseDown={(e) =>
                        startColResize(e, "doc", getColWidth("doc", COL_DOC))
                      }
                    />
                  </th>
                  {runColumns.map((col) => (
                    <th key={col.id} style={cellHeaderStyle(c)} className="group/header">
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {col.label}
                            </span>
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
                                flexShrink: 0,
                              }}
                            >
                              {getFormatShort(col.format)}
                            </span>
                          </div>
                          {col.prompt && col.prompt !== col.label && (
                            <div
                              style={{
                                fontSize: 9,
                                color: c.t3,
                                fontWeight: 400,
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                textTransform: "none",
                                letterSpacing: 0,
                              }}
                              title={col.prompt}
                            >
                              {col.prompt}
                            </div>
                          )}
                        </div>
                        {!workflow.is_builtin && (
                          <ColumnEditMenu
                            column={col}
                            theme={theme}
                            onSave={async (patch) => {
                              const { promptChanged } = await handleSaveColumn(col.id, patch);
                              if (promptChanged) {
                                setPendingColumnRetry({ columnId: col.id, label: patch.label });
                              }
                            }}
                          />
                        )}
                      </div>
                      <ColResizeHandle
                        active={resizingKey === col.id}
                        onMouseDown={(e) =>
                          startColResize(e, col.id, getColWidth(col.id, COL_DEFAULT))
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((rowKey) => {
                  const doc = docs.find((d) => d.doc_id === rowKey);
                  return (
                    <tr key={rowKey}>
                      <td style={cellBodyStyle(c)}>
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
                        const key = cellKey(rowKey, col.id);
                        if (cell && cell.status === "complete") {
                          return (
                            <ValueCell
                              key={col.id}
                              cell={cell}
                              column={col}
                              selected={selectedCellKey === key}
                              onSelect={() => setSelectedCellKey(key)}
                              onRetry={() => handleRetryCell(cell.id)}
                              retrying={retryingCellIds.has(cell.id)}
                              theme={theme}
                              density={density}
                              onCitationClick={handleCitationClick}
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
            )}
          </div>
        </div>

        <RunDetailSidebar
          theme={theme}
          run={run}
          runHistory={runHistory}
          selectedCell={selectedCell}
          selectedColumn={selectedColumn}
          selectedRowLabel={selectedRowLabel}
          activeCitId={activeCitId}
          onCitationClick={handleCitationClick}
          onRetryCell={handleRetryCell}
          retrying={selectedCell ? retryingCellIds.has(selectedCell.id) : false}
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

      {pendingColumnRetry && (
        <ConfirmDialog
          title="Re-run with updated prompt?"
          message={`This will discard existing answers for "${pendingColumnRetry.label}" and re-run the updated prompt against ${rowKeys.length} ${rowKeys.length === 1 ? "row" : "rows"}.`}
          confirmLabel="Re-run"
          cancelLabel="Keep existing"
          onConfirm={() => {
            const { columnId } = pendingColumnRetry;
            setPendingColumnRetry(null);
            void handleRetryColumn(columnId);
          }}
          onCancel={() => setPendingColumnRetry(null)}
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
  onRetry,
  retrying,
  theme,
  density,
  onCitationClick,
}: {
  cell: TabularCell;
  column: WorkflowColumn;
  selected: boolean;
  onSelect: () => void;
  onRetry: () => void;
  retrying: boolean;
  theme: Theme;
  density: CellDensity;
  onCitationClick: (citation: Citation, id: string) => void;
}) {
  const c = ddTheme(theme);
  const display = formatCellValue(cell, column);
  const fullAnswer = stripSourceMarkers(cell.answer).trim();

  return (
    <td
      onClick={onSelect}
      className="group/cell"
      style={{
        ...cellBodyStyle(c),
        padding: 0,
        fontSize: 11,
        lineHeight: 1.2,
        cursor: "pointer",
        position: "relative",
        verticalAlign: "top",
        background: selected ? tint(ACCENT, 12) : c.surface,
        boxShadow: selected ? `inset 0 0 0 1px ${tint(ACCENT, 55)}` : undefined,
      }}
      title={fullAnswer || (Array.isArray(display) ? display.join("; ") : display)}
    >
      <CellRenderer
        cell={cell}
        column={column}
        theme={theme}
        density={density}
        onCitationClick={onCitationClick}
        citationIdPrefix={`${cell.id}_${column.id}`}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!retrying) onRetry();
        }}
        className="opacity-0 group-hover/cell:opacity-100 transition-opacity"
        style={{
          position: "absolute",
          top: 3,
          right: 3,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: retrying ? c.t3 : c.t2,
          cursor: retrying ? "wait" : "pointer",
          padding: 0,
        }}
        title="Re-run this cell"
        aria-label="Retry cell"
      >
        <RetryIcon spinning={retrying} />
      </button>
    </td>
  );
}

function RetryIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? "dd-spin" : undefined}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4v6h6M20 20v-6h-6M5.07 9A8 8 0 0119.93 9M18.93 15A8 8 0 014.07 15" />
    </svg>
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
          column.format === "monetary_amount" ||
          column.format === "metric"
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

function ViewSwitcher({
  value,
  onChange,
  theme,
}: {
  value: WorkflowView;
  onChange: (value: WorkflowView) => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const options: Array<{ value: WorkflowView; label: string; title: string }> = [
    { value: "compact", label: "Compact", title: "Dense rows for scanning many docs" },
    { value: "comfortable", label: "Comfortable", title: "Default — summary + caveats per cell" },
    { value: "compare", label: "Compare", title: "One column, all docs side-by-side with diff" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Workflow view"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 7,
        border: `1px solid ${c.border}`,
        background: c.surfaceAlt,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            style={{
              border: "none",
              borderRadius: 5,
              background: active ? c.surface : "transparent",
              color: active ? c.t1 : c.t3,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
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
  const answer = selectedCell ? demoteHeadings(selectedCell.answer).trim() : "";
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

function CellSourcesPanel({
  theme,
  cell,
  column,
  rowLabel,
  answer,
  citations,
  activeCitId,
  onCitationClick,
}: {
  theme: Theme;
  cell: TabularCell | null;
  column: WorkflowColumn | null;
  rowLabel: string;
  answer: string;
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
    const summary = (formatted as { summary?: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary.trim();
    const body = (formatted as { body?: unknown }).body;
    if (typeof body === "string" && body.trim()) return body.trim().split(/\n+/)[0].trim();
    const items = (formatted as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items
        .map((item) =>
          typeof item === "object" && item !== null && "text" in item
            ? String((item as { text?: unknown }).text ?? "")
            : String(item)
        )
        .filter(Boolean);
    }
    const pairs = (formatted as { pairs?: unknown }).pairs;
    if (Array.isArray(pairs)) {
      return pairs
        .map((pair) => {
          if (!pair || typeof pair !== "object") return "";
          const p = pair as { key?: unknown; value?: unknown; unit?: unknown };
          return [p.key, [p.value, p.unit].filter(Boolean).join(" ")].filter(Boolean).join(": ");
        })
        .filter(Boolean);
    }
    const iso = (formatted as { iso?: unknown }).iso;
    if (typeof iso === "string" && iso.trim()) return iso.trim();
    const shapedValue = (formatted as { value?: unknown }).value;
    const unit = (formatted as { unit?: unknown }).unit;
    if (typeof shapedValue === "boolean") return shapedValue ? "Yes" : "No";
    if (typeof shapedValue === "string" && shapedValue.trim()) return shapedValue.trim();
    if (typeof shapedValue === "number") return [shapedValue, unit].filter(Boolean).join(" ");
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

  if (format === "metric" || format === "monetary_amount") {
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
  if (format === "yes_no" || format === "bool") {
    const first = cleaned.split(/\W+/)[0]?.toLowerCase();
    if (first === "yes") return "Yes";
    if (first === "no") return "No";
    return "";
  }
  if (format === "date") {
    const match = cleaned.match(/\d{4}-\d{2}-\d{2}(?:\s+to\s+\d{4}-\d{2}-\d{2})?/);
    return match?.[0] ?? "";
  }
  if (format === "enum") {
    return cleaned.split(/\n+/)[0].trim();
  }
  return cleaned.split(/\n+/)[0].trim();
}

function isMissingValue(value: string): boolean {
  return /^(not stated|not disclosed|not specified|not provided|not mentioned|not addressed|not available|not found|no relevant|n\/a|unknown|unclear)\b/i.test(
    value.replace(/[.\s]+$/g, "").trim()
  );
}

// The row → column label at the top of the cell-detail panel already names
// the column, so any LLM-emitted "## Share-based Compensation" line is
// redundant. Demote markdown headings to bold paragraph text.
function demoteHeadings(value: string): string {
  return value.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");
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
    padding: "7px 12px 7px 9px",
    borderBottom: `1px solid ${c.border}`,
    borderRight: `1px solid ${c.border}`,
    color: c.t2,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "left",
    background: c.surfaceAlt,
    position: "relative",
    verticalAlign: "top",
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

function ColResizeHandle({
  active,
  onMouseDown,
}: {
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      draggable={false}
      title="Drag to resize"
      className="hover:bg-blue-400/40"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        userSelect: "none",
        background: active ? "rgba(59, 130, 246, 0.55)" : "transparent",
        transition: "background 120ms",
        zIndex: 5,
      }}
    />
  );
}

interface ColumnDraft {
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags: string[];
}

function ColumnEditMenu({
  column,
  theme,
  onSave,
}: {
  column: WorkflowColumn;
  theme: Theme;
  onSave: (patch: ColumnDraft) => Promise<void> | void;
}) {
  const c = ddTheme(theme);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ColumnDraft>({
    label: column.label,
    prompt: column.prompt,
    format: column.format,
    tags: column.tags ?? [],
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 560 });
  const autoDetectedShape = useMemo(
    () => detectShape(`${draft.label}\n${draft.prompt}`),
    [draft.label, draft.prompt]
  );

  useEffect(() => {
    if (!open) {
      setDraft({
        label: column.label,
        prompt: column.prompt,
        format: column.format,
        tags: column.tags ?? [],
      });
    }
  }, [column, open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 460;
      const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
      const left = Math.min(
        Math.max(16, rect.right - width),
        Math.max(16, window.innerWidth - width - 16)
      );
      setPos({ top, left, maxHeight: Math.max(320, window.innerHeight - top - 16) });
    };
    updatePosition();
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function updateDraft(patch: Partial<ColumnDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function autoGeneratePrompt() {
    const label = draft.label.trim();
    if (!label) return;
    const preset = getPresetConfig(label);
    updateDraft({
      prompt: preset?.prompt || buildFallbackPrompt(label, draft.format, draft.tags),
      format: preset?.format || draft.format,
      tags: preset?.tags || draft.tags,
    });
  }

  async function handleSave() {
    const label = draft.label.trim();
    const prompt = draft.prompt.trim();
    if (!label || !prompt) return;
    setSaving(true);
    try {
      await onSave({ label, prompt, format: draft.format, tags: draft.tags });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="opacity-50 group-hover/header:opacity-100 transition-opacity"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: c.t2,
          cursor: "pointer",
          padding: 0,
        }}
        title="Edit column label, prompt, and format"
        aria-label="Edit column"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="6" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="12" cy="18" r="1.2" />
        </svg>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: "min(460px, calc(100vw - 32px))",
              maxHeight: pos.maxHeight,
              overflowY: "auto",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              boxShadow: "0 16px 40px rgba(15,23,42,0.25)",
              zIndex: 9999,
              color: c.t1,
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: `1px solid ${c.border}`,
                position: "sticky",
                top: 0,
                background: c.surface,
                zIndex: 1,
              }}
            >
              <div style={{ fontWeight: 600 }}>Edit column</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "transparent",
                  color: c.t2,
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <Field label="Label" theme={theme}>
                <input
                  value={draft.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    const preset = getPresetConfig(label);
                    updateDraft({
                      label,
                      ...(preset
                        ? { prompt: preset.prompt, format: preset.format, tags: preset.tags || [] }
                        : {}),
                    });
                  }}
                  style={inputStyle(c)}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 12 }}>
                <Field label="Answer shape" theme={theme}>
                  <ShapePicker
                    value={draft.format}
                    onChange={(format) =>
                      updateDraft({
                        format,
                        tags: format === "enum" ? draft.tags : [],
                      })
                    }
                    theme={theme}
                  />
                  {autoDetectedShape && autoDetectedShape.value !== draft.format && (
                    <div style={{ fontSize: 10, color: c.t3, marginTop: 7, lineHeight: 1.45 }}>
                      Suggested:{" "}
                      <button
                        type="button"
                        onClick={() => updateDraft({ format: autoDetectedShape.value })}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: autoDetectedShape.color,
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {autoDetectedShape.label.toLowerCase()}
                      </button>
                      {" · "}
                      {autoDetectedShape.example}
                    </div>
                  )}
                </Field>
                <Field label="Preset" theme={theme}>
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) return;
                      const preset = PE_COLUMN_PRESETS.find((p) => p.name === name);
                      if (!preset) return;
                      updateDraft({
                        label: preset.name,
                        prompt: preset.prompt,
                        format: preset.format,
                        tags: preset.tags || [],
                      });
                    }}
                    style={inputStyle(c)}
                  >
                    <option value="">Choose…</option>
                    {PE_COLUMN_PRESETS.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {(draft.format === "tag" || draft.format === "enum") && (
                <Field label="Shape options" theme={theme} style={{ marginTop: 12 }}>
                  <ShapeOptionsInspector
                    format={draft.format}
                    tags={draft.tags}
                    onTagsChange={(tags) => updateDraft({ tags })}
                    theme={theme}
                  />
                </Field>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Prompt
                </span>
                <button
                  onClick={autoGeneratePrompt}
                  disabled={!draft.label.trim()}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: ACCENT,
                    fontSize: 11,
                    cursor: draft.label.trim() ? "pointer" : "not-allowed",
                    opacity: draft.label.trim() ? 1 : 0.4,
                  }}
                >
                  Auto-generate
                </button>
              </div>
              <textarea
                rows={8}
                value={draft.prompt}
                onChange={(e) => updateDraft({ prompt: e.target.value })}
                style={{
                  ...inputStyle(c),
                  marginTop: 4,
                  resize: "none",
                  lineHeight: 1.55,
                  fontFamily: "inherit",
                }}
              />
              <div style={{ marginTop: 12 }}>
                <Field label="Cell preview" theme={theme}>
                  <CellRenderPreview
                    column={{
                      id: column.id,
                      order_index: column.order_index,
                      label: draft.label,
                      prompt: draft.prompt,
                      format: draft.format,
                      tags: draft.tags,
                      is_derived: column.is_derived,
                      formula: column.formula,
                    }}
                    theme={theme}
                  />
                </Field>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "12px 16px",
                borderTop: `1px solid ${c.border}`,
                position: "sticky",
                bottom: 0,
                background: c.surface,
              }}
            >
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "6px 12px",
                  border: `1px solid ${c.border}`,
                  borderRadius: 7,
                  background: "transparent",
                  color: c.t2,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.label.trim() || !draft.prompt.trim()}
                style={{
                  padding: "6px 14px",
                  border: "none",
                  borderRadius: 7,
                  background: ACCENT,
                  color: "white",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving || !draft.label.trim() || !draft.prompt.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Field({
  label,
  theme,
  children,
  style,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const c = ddTheme(theme);
  return (
    <label style={{ display: "block", ...style }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: c.t3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function inputStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${c.border}`,
    borderRadius: 6,
    background: c.bg,
    color: c.t1,
    fontSize: 12,
    outline: "none",
  };
}
