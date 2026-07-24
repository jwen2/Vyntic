import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listDocuments, type Citation, type DocumentMetadata } from "@/lib/api";
import {
  cancelRun,
  downloadRunExport,
  getRun,
  listRuns,
  patchWorkflowColumn,
  retryCell as retryCellApi,
  retryColumn as retryColumnApi,
  subscribeRun,
  type RunStreamEvent,
  type TabularCell,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import type { ColumnFormat } from "@/lib/matrixColumnConfig";
import type { CellDensity } from "@/components/workflows/cells/CellRenderer";
import { formatCellValue, stripSourceMarkers } from "./format";
import { proseValue } from "../cells/CellRenderer";

export type Theme = "light" | "dark";
export type WorkflowView = "compact" | "comfortable" | "compare";

export interface RunLogEntry {
  id: string;
  ts: number;
  level: "info" | "ok" | "warn" | "err";
  text: string;
}

export interface ViewerState {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
}

export const cellKey = (rowKey: string, columnId: string) => `${rowKey}__${columnId}`;

const COL_DOC = 260;
const COL_DEFAULT = 200;
const MIN_COL_WIDTH = 140;
const MAX_COL_WIDTH = 1200;

interface UseTabularRunArgs {
  dealId: string;
  runId: string;
  workflow: Workflow;
  onComplete?: (run: WorkflowRun) => void;
  onWorkflowChange?: (workflow: Workflow) => void;
}

// Owns everything behind a tabular run: the workflow snapshot, run + cell
// state, SSE subscription, document/history loads, per-column widths, view
// prefs, selection, and the retry/cancel/export/save handlers. Presentational
// components consume the returned bag; they never touch fetch or SSE.
export function useTabularRun({
  dealId,
  runId,
  workflow: workflowProp,
  onComplete,
  onWorkflowChange,
}: UseTabularRunArgs) {
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
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
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
    async (
      columnId: string,
      patch: { label: string; prompt: string; format: ColumnFormat; tags: string[] }
    ): Promise<{ promptChanged: boolean }> => {
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
  // "High risk" is counted from real signals, not a regex over the whole
  // answer: prose shapes carry explicit caveat severities, while scalar/enum
  // shapes (a High/Medium/Low rating) are matched on their *formatted* value.
  // The old `/\bhigh\b/` over `cell.answer` scanned prose JSON blobs and fired
  // on incidental words like "high-growth" while ignoring risk caveats.
  const highRiskCount = useMemo(() => {
    let count = 0;
    cells.forEach((cell) => {
      if (cell.status !== "complete") return;
      const raw = stripSourceMarkers(cell.answer || "").trim();
      const formatted = cell.answer_formatted;
      const isProse =
        !!formatted &&
        typeof formatted === "object" &&
        !Array.isArray(formatted) &&
        ("summary" in (formatted as Record<string, unknown>) ||
          "body" in (formatted as Record<string, unknown>));
      if (isProse) {
        if (proseValue(formatted, raw).caveats.some((caveat) => caveat.severity === "risk")) {
          count += 1;
        }
        return;
      }
      const column = runColumns.find((col) => col.id === cell.column_id);
      if (!column) return;
      const display = formatCellValue(cell, column);
      const text = Array.isArray(display) ? display.join(" ") : display;
      if (/\bhigh\b/i.test(text)) count += 1;
    });
    return count;
  }, [cells, runColumns]);

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

  const isTerminal = run ? ["complete", "error", "cancelled"].includes(run.status) : false;

  return {
    // constants
    COL_DOC,
    COL_DEFAULT,
    // core state
    workflow,
    run,
    cells,
    docs,
    log,
    error,
    cancelling,
    exporting,
    runHistory,
    view,
    setView,
    density,
    colWidths,
    resizingKey,
    viewerState,
    setViewerState,
    pendingColumnRetry,
    setPendingColumnRetry,
    retryingCellIds,
    activeCitId,
    selectedCellKey,
    setSelectedCellKey,
    // derived
    runColumns,
    documentIds,
    rowKeys,
    totalCells,
    completeCells,
    selectedCell,
    selectedColumn,
    selectedRowLabel,
    highRiskCount,
    elapsedLabel,
    isTerminal,
    // handlers
    getColWidth,
    startColResize,
    handleCitationClick,
    handleRetryCell,
    handleRetryColumn,
    handleSaveColumn,
    handleCancel,
    handleExport,
  };
}
