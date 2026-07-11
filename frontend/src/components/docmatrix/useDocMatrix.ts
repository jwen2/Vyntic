import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DocumentMetadata,
  Citation,
  DocMatrixEvent,
  docMatrixStream,
} from "@/lib/api";
import {
  buildFallbackPrompt,
  createColumnId,
  getPresetConfig,
  type ColumnFormat,
  type MatrixColumnConfig,
} from "@/lib/matrixColumnConfig";

// ── Types ──

export interface DocResult {
  answer: string;
  citations: (Citation | null)[];
  status: "idle" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

export type SortConfig = { col: "doc"; dir: "asc" | "desc" } | null;

const MIN_COL_WIDTH = 140;
const MAX_COL_WIDTH = 1200;

// ── Column helpers ──

function makeColumn(label: string, patch: Partial<MatrixColumnConfig> = {}): MatrixColumnConfig {
  const cleanLabel = label.trim();
  const preset = getPresetConfig(cleanLabel);
  const format = patch.format ?? preset?.format ?? "text";
  const tags = patch.tags ?? preset?.tags;
  return {
    id: patch.id ?? createColumnId(),
    label: patch.label ?? cleanLabel,
    prompt:
      patch.prompt ??
      preset?.prompt ??
      buildFallbackPrompt(cleanLabel, format, tags),
    format,
    tags,
  };
}

function normalizeStoredColumns(raw: unknown): MatrixColumnConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return makeColumn(item, { prompt: item });
      if (!item || typeof item !== "object") return null;
      const value = item as Partial<MatrixColumnConfig>;
      const label = String(value.label || value.prompt || "").trim();
      if (!label) return null;
      return makeColumn(label, {
        id: value.id,
        prompt: value.prompt || label,
        format: value.format || "text",
        tags: value.tags,
      });
    })
    .filter((item): item is MatrixColumnConfig => item !== null);
}

// ── Hook ──
//
// Owns the doc-matrix's column config, per-doc run results, streaming lifecycle,
// per-column width overrides, sort, and localStorage persistence. UI chrome
// (viewer, confirm dialogs, template dropdown, drag/menu positioning) stays in
// the presentational components.
export function useDocMatrix(dealId: string, documents: DocumentMetadata[]) {
  const [columns, setColumns] = useState<MatrixColumnConfig[]>([]);
  const queries = useMemo(() => columns.map((column) => column.id), [columns]);
  const columnById = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.id, column])),
    [columns]
  );
  const [cells, setCells] = useState<Record<string, Record<string, DocResult>>>({});
  const [loading, setLoading] = useState(false);
  const [pendingColumnUpdate, setPendingColumnUpdate] = useState<MatrixColumnConfig | null>(null);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // Per-column width overrides (key: "doc" or the column id).
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

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

  // ── Persistence Setup ──
  const CACHE_KEY = useMemo(() => `vyntic_doc_matrix_${dealId}`, [dealId]);
  const WIDTH_KEY = useMemo(() => `vyntic_doc_matrix_widths_${dealId}`, [dealId]);

  // Load + persist column-width overrides per deal
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIDTH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setColWidths(parsed);
      }
    } catch {}
  }, [WIDTH_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths, WIDTH_KEY]);

  const latestState = useRef({ columns, cells });
  useEffect(() => {
    latestState.current = { columns, cells };
  }, [columns, cells]);

  // Load from local storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const storedColumns = normalizeStoredColumns(p.columns ?? p.queries);
        if (storedColumns.length > 0 && p.cells) {
          const nextCells = { ...p.cells };
          // One-time migration from old query-text keys to stable column ids.
          if (!p.columns && Array.isArray(p.queries)) {
            for (const [docId, docCells] of Object.entries(nextCells)) {
              const migrated: Record<string, DocResult> = {};
              for (const column of storedColumns) {
                const legacy = (docCells as Record<string, DocResult>)[column.prompt];
                if (legacy) migrated[column.id] = legacy;
              }
              nextCells[docId] = { ...(docCells as Record<string, DocResult>), ...migrated };
            }
          }
          setColumns(storedColumns);
          setCells(nextCells);
        }
      }
    } catch {}

    // Save on exact unmount (tab switch / navigation)
    return () => {
      const { columns: storedCols, cells: sc } = latestState.current;
      if (storedCols.length === 0) return;
      try {
        const persistableCells: typeof sc = {};
        for (const [docId, docCells] of Object.entries(sc)) {
          persistableCells[docId] = {};
          for (const [q, r] of Object.entries(docCells)) {
            if (r.status === "complete" || r.status === "error") {
              persistableCells[docId][q] = r;
            }
          }
        }
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ columns: storedCols, cells: persistableCells })
        );
      } catch {}
    };
  }, [CACHE_KEY]);

  // Debounced save
  useEffect(() => {
    if (columns.length === 0) return;
    const tid = setTimeout(() => {
      try {
        const persistableCells: typeof cells = {};
        for (const [docId, docCells] of Object.entries(cells)) {
          persistableCells[docId] = {};
          for (const [q, r] of Object.entries(docCells)) {
            if (r.status === "complete" || r.status === "error") {
              persistableCells[docId][q] = r;
            }
          }
        }
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ columns, cells: persistableCells })
        );
      } catch {}
    }, 1000);
    return () => clearTimeout(tid);
  }, [columns, cells, CACHE_KEY]);

  // Cleanup on unmount
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  // Streaming runner — kicks off a doc-matrix sweep for `columnId` against the
  // given documents (defaults to all current documents) and writes results into
  // cells under that column id. Concurrent runs are tracked per controllerKey so
  // we can cancel just one stream (e.g. column rename, single-cell retry) without
  // disturbing other in-flight work. `controllerKey` defaults to the column id —
  // pass a unique key (e.g. `${columnId}::${docId}`) for per-cell retries so they
  // don't clobber a column-wide stream.
  const runQueryStream = useCallback(
    (
      columnId: string,
      opts?: { docIds?: string[]; controllerKey?: string; column?: MatrixColumnConfig }
    ) => {
      // Callers that just created or edited a column must pass it via
      // opts.column — setColumns hasn't re-rendered yet, so the columnById
      // lookup would miss (or return the stale prompt) and the fallback
      // would send the column UUID to the LLM as the question.
      const column = opts?.column ?? columnById[columnId];
      const prompt = column?.prompt || columnId;
      const docIds = opts?.docIds ?? documents.map((d) => d.doc_id);
      const controllerKey = opts?.controllerKey ?? columnId;
      if (docIds.length === 0) return;

      // If a stream is already running for this controller key, abort it first
      controllersRef.current.get(controllerKey)?.abort();

      setLoading(true);

      const controller = docMatrixStream(
        dealId,
        docIds,
        prompt,
        (event: DocMatrixEvent) => {
          setCells((prev) => {
            const updated = { ...prev };
            const docCells = { ...(updated[event.doc_id] || {}) };

            if (event.type === "token") {
              const current = docCells[columnId] || {
                answer: "",
                citations: [],
                status: "loading" as const,
              };
              docCells[columnId] = {
                ...current,
                answer: current.answer + event.token,
                status: "loading",
              };
            } else if (event.type === "done") {
              docCells[columnId] = {
                answer: event.answer,
                citations: event.citations,
                status: "complete",
                model: event.model,
                fallback: event.fallback,
                duration_ms: event.duration_ms,
              };
            } else if (event.type === "error") {
              docCells[columnId] = {
                answer: event.error,
                citations: [],
                status: "error",
              };
            }

            updated[event.doc_id] = docCells;
            return updated;
          });
        },
        () => {
          controllersRef.current.delete(controllerKey);
          if (controllersRef.current.size === 0) setLoading(false);
        },
        (err) => {
          console.error("Doc matrix stream error:", err);
          controllersRef.current.delete(controllerKey);
          if (controllersRef.current.size === 0) setLoading(false);
        }
      );

      controllersRef.current.set(controllerKey, controller);
    },
    [columnById, dealId, documents]
  );

  const retryCell = useCallback(
    (docId: string, query: string) => {
      setCells((prev) => {
        const next = { ...prev };
        const docCells = { ...(next[docId] || {}) };
        docCells[query] = { answer: "", citations: [], status: "loading" };
        next[docId] = docCells;
        return next;
      });
      runQueryStream(query, {
        docIds: [docId],
        controllerKey: `${query}::${docId}`,
      });
    },
    [runQueryStream]
  );

  const removeQuery = useCallback((index: number) => {
    setColumns((prev) => {
      const query = prev[index]?.id;
      if (!query) return prev;
      // Cancel any in-flight stream for the removed column
      controllersRef.current.get(query)?.abort();
      controllersRef.current.delete(query);
      setCells((prevCells) => {
        const newCells = { ...prevCells };
        for (const docId of Object.keys(newCells)) {
          const docCells = { ...newCells[docId] };
          delete docCells[query];
          newCells[docId] = docCells;
        }
        return newCells;
      });
      setColWidths((prev) => {
        if (!(query in prev)) return prev;
        const next = { ...prev };
        delete next[query];
        return next;
      });
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const applyColumnUpdate = useCallback(
    (nextColumn: MatrixColumnConfig, rerun: boolean) => {
      const previous = columnById[nextColumn.id];
      if (!previous) return;
      controllersRef.current.get(nextColumn.id)?.abort();
      controllersRef.current.delete(nextColumn.id);
      setColumns((prev) =>
        prev.map((column) => (column.id === nextColumn.id ? nextColumn : column))
      );
      if (!rerun) return;
      setCells((prev) => {
        const next = { ...prev };
        for (const doc of documents) {
          const docCells = { ...(next[doc.doc_id] || {}) };
          docCells[nextColumn.id] = { answer: "", citations: [], status: "loading" };
          next[doc.doc_id] = docCells;
        }
        return next;
      });
      runQueryStream(nextColumn.id, { column: nextColumn });
    },
    [columnById, documents, runQueryStream]
  );

  const saveColumn = useCallback(
    (nextColumn: MatrixColumnConfig) => {
      const previous = columnById[nextColumn.id];
      if (!previous) return;
      const promptChanged = previous.prompt.trim() !== nextColumn.prompt.trim();
      const hasCompleteAnswers = documents.some(
        (doc) => cells[doc.doc_id]?.[nextColumn.id]?.status === "complete"
      );
      if (promptChanged && hasCompleteAnswers) {
        setPendingColumnUpdate(nextColumn);
        return;
      }
      applyColumnUpdate(nextColumn, promptChanged);
    },
    [applyColumnUpdate, cells, columnById, documents]
  );

  const confirmColumnUpdate = useCallback(() => {
    setPendingColumnUpdate((column) => {
      if (column) applyColumnUpdate(column, true);
      return null;
    });
  }, [applyColumnUpdate]);

  const cancelColumnUpdate = useCallback(() => setPendingColumnUpdate(null), []);

  const reorderQueries = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setColumns((prev) => {
      const newColumns = [...prev];
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      return newColumns;
    });
  }, []);

  const addQuery = useCallback(
    (queryText: string) => {
      const column = makeColumn(queryText);
      if (!column.label || documents.length === 0) return;
      if (columns.some((existing) => existing.label.toLowerCase() === column.label.toLowerCase())) return;

      setColumns((prev) => [...prev, column]);

      setCells((prev) => {
        const updated = { ...prev };
        for (const doc of documents) {
          updated[doc.doc_id] = {
            ...(updated[doc.doc_id] || {}),
            [column.id]: { answer: "", citations: [], status: "loading" },
          };
        }
        return updated;
      });

      runQueryStream(column.id, { column });
    },
    [columns, documents, runQueryStream]
  );

  const addTemplateColumn = useCallback(
    (label: string, prompt?: string, format?: ColumnFormat, tags?: string[]) => {
      const column = makeColumn(label, { prompt, format, tags });
      if (documents.length === 0) return;
      if (columns.some((existing) => existing.label.toLowerCase() === column.label.toLowerCase())) return;
      setColumns((prev) => [...prev, column]);
      setCells((prev) => {
        const updated = { ...prev };
        for (const doc of documents) {
          updated[doc.doc_id] = {
            ...(updated[doc.doc_id] || {}),
            [column.id]: { answer: "", citations: [], status: "loading" },
          };
        }
        return updated;
      });
      runQueryStream(column.id, { column });
    },
    [columns, documents, runQueryStream]
  );

  return {
    columns,
    columnById,
    queries,
    cells,
    loading,
    colWidths,
    resizingKey,
    sortConfig,
    pendingColumnUpdate,
    getColWidth,
    startColResize,
    setSortConfig,
    addQuery,
    addTemplateColumn,
    retryCell,
    saveColumn,
    removeQuery,
    reorderQueries,
    confirmColumnUpdate,
    cancelColumnUpdate,
  };
}
