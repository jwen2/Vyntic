"use client";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import {
  DocumentMetadata,
  Citation,
  DocMatrixEvent,
  docMatrixStream,
} from "@/lib/api";
import { QUERY_TEMPLATES } from "@/lib/queryTemplates";
import DocumentViewer from "./DocumentViewer";
import ConfirmDialog from "./ConfirmDialog";
import { fixMarkdownTables } from "@/lib/markdownUtils";
import AnswerText, { CitBadge } from "@/components/dd/AnswerText";

// ── Types ──

interface DocResult {
  answer: string;
  citations: (Citation | null)[];
  status: "idle" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

interface ViewerState {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
}

interface Props {
  documents: DocumentMetadata[];
  dealId: string;
  onViewDocument: (citation: Citation) => void;
  onDeleteDocument?: (doc: DocumentMetadata) => Promise<void> | void;
  activeCitationId?: string | null;
  onInspectCitation?: (citation: Citation, id: string) => void;
}

// ── Helpers ──

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function citationId(citation: Citation, index: number) {
  return `${citation.source_file}_p${citation.page}_${index}`;
}

function fileTypeIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "xlsx" || ext === "xls") return "XLS";
  if (ext === "csv") return "CSV";
  return "DOC";
}

function fileTypeColor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
  if (ext === "xlsx" || ext === "xls") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400";
  if (ext === "csv") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

// ── Main Component ──

export default function DocMatrixPanel({
  documents,
  dealId,
  onViewDocument,
  onDeleteDocument,
  activeCitationId = null,
  onInspectCitation,
}: Props) {
  const [queries, setQueries] = useState<string[]>([]);
  const [cells, setCells] = useState<
    Record<string, Record<string, DocResult>>
  >({});
  const [newQuery, setNewQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentMetadata | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDocError, setDeleteDocError] = useState<string | null>(null);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // Column management state
  const [editingColIndex, setEditingColIndex] = useState<number | null>(null);
  const [editingColValue, setEditingColValue] = useState("");
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);
  const [pendingRename, setPendingRename] = useState<{
    index: number;
    oldQuery: string;
    newName: string;
  } | null>(null);
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  // Per-column width overrides (key: "doc" or the query string). Falls back to
  // density-driven defaults when no override is set.
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);

  // Unified Excel-like header filter/sort for all columns
  const [openMenu, setOpenMenu] = useState<"doc" | number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{ col: "doc" | number; dir: "asc" | "desc" } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const handleDeleteDocument = async () => {
    if (!confirmDeleteDoc || !onDeleteDocument) return;
    setDeletingDocId(confirmDeleteDoc.doc_id);
    setDeleteDocError(null);
    try {
      await onDeleteDocument(confirmDeleteDoc);
      setConfirmDeleteDoc(null);
    } catch (err) {
      setDeleteDocError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeletingDocId(null);
    }
  };

  // Density preference (compact vs comfortable column widths)
  type Density = "compact" | "comfortable";
  const DENSITY_KEY = "vyntic_doc_matrix_density";
  const [density, setDensity] = useState<Density>("comfortable");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DENSITY_KEY);
      if (saved === "compact" || saved === "comfortable") setDensity(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch {}
  }, [density]);

  const COL_DOC = 240;
  const COL_QUERY = density === "compact" ? 480 : 720;
  const COL_ADD = 360;
  const MIN_COL_WIDTH = 140;
  const MAX_COL_WIDTH = 1200;

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

  const setColFilter = (col: "doc" | number, value: string) => {
    setColFilters((prev) => ({ ...prev, [String(col)]: value }));
  };
  const getColFilter = (col: "doc" | number) => colFilters[String(col)] || "";
  const isColFiltered = (col: "doc" | number) =>
    !!getColFilter(col) || (sortConfig?.col === col);
  const hasAnyFilter = Object.values(colFilters).some((v) => v) || sortConfig !== null;

  const getCellAnswer = (docId: string, query: string) =>
    cells[docId]?.[query]?.answer || "";

  const filteredDocuments = useMemo(() => {
    let result = documents;
    // Apply document name filter
    const docFilter = getColFilter("doc");
    if (docFilter) {
      const lower = docFilter.toLowerCase();
      result = result.filter((d) => d.filename.toLowerCase().includes(lower));
    }
    // Apply query column filters
    for (const [key, value] of Object.entries(colFilters)) {
      if (key === "doc" || !value) continue;
      const queryIdx = parseInt(key, 10);
      const query = queries[queryIdx];
      if (!query) continue;
      const lower = value.toLowerCase();
      result = result.filter((d) =>
        getCellAnswer(d.doc_id, query).toLowerCase().includes(lower)
      );
    }
    // Apply sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aVal: string, bVal: string;
        if (sortConfig.col === "doc") {
          aVal = a.filename;
          bVal = b.filename;
        } else {
          const query = queries[sortConfig.col];
          aVal = getCellAnswer(a.doc_id, query);
          bVal = getCellAnswer(b.doc_id, query);
        }
        return sortConfig.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }
    return result;
  }, [documents, colFilters, sortConfig, queries, cells]);

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

  const latestState = useRef({ queries, cells });
  useEffect(() => {
    latestState.current = { queries, cells };
  }, [queries, cells]);

  // Load from local storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.queries && p.cells) {
          setQueries(p.queries);
          setCells(p.cells);
        }
      }
    } catch {}

    // Save on exact unmount (tab switch / navigation)
    return () => {
      const { queries: sq, cells: sc } = latestState.current;
      if (sq.length === 0) return;
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
          JSON.stringify({ queries: sq, cells: persistableCells })
        );
      } catch {}
    };
  }, [CACHE_KEY]);

  // Debounced save
  useEffect(() => {
    if (queries.length === 0) return;
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
          JSON.stringify({ queries, cells: persistableCells })
        );
      } catch {}
    }, 1000);
    return () => clearTimeout(tid);
  }, [queries, cells, CACHE_KEY]);

  const templateRef = useRef<HTMLDivElement>(null);
  const templateBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });

  // Cleanup on unmount
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  // Column header menu open handler
  const openColMenu = (col: "doc" | number, thElement: HTMLElement) => {
    if (openMenu === col) {
      setOpenMenu(null);
      return;
    }
    const rect = thElement.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 2, left: rect.left });
    setOpenMenu(col);
  };

  // Column header menu close on outside click
  useEffect(() => {
    if (openMenu === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Position and close template dropdown
  useEffect(() => {
    if (!showTemplates) return;
    if (templateBtnRef.current) {
      const rect = templateBtnRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 384),
      });
    }
    const handler = (e: MouseEvent) => {
      if (
        templateRef.current &&
        !templateRef.current.contains(e.target as Node) &&
        templateBtnRef.current &&
        !templateBtnRef.current.contains(e.target as Node)
      ) {
        setShowTemplates(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplates]);

  // Streaming runner — kicks off a doc-matrix sweep for `query` against the given
  // documents (defaults to all current documents) and writes results into cells
  // under that query key. Concurrent runs are tracked per controllerKey so we can
  // cancel just one stream (e.g. column rename, single-cell retry) without
  // disturbing other in-flight work. `controllerKey` defaults to the query — pass
  // a unique key (e.g. `${query}::${docId}`) for per-cell retries so they don't
  // clobber a column-wide stream.
  const runQueryStream = useCallback(
    (
      query: string,
      opts?: { docIds?: string[]; controllerKey?: string }
    ) => {
      const docIds = opts?.docIds ?? documents.map((d) => d.doc_id);
      const controllerKey = opts?.controllerKey ?? query;
      if (docIds.length === 0) return;

      // If a stream is already running for this controller key, abort it first
      controllersRef.current.get(controllerKey)?.abort();

      setLoading(true);

      const controller = docMatrixStream(
        dealId,
        docIds,
        query,
        (event: DocMatrixEvent) => {
          setCells((prev) => {
            const updated = { ...prev };
            const docCells = { ...(updated[event.doc_id] || {}) };

            if (event.type === "token") {
              const current = docCells[query] || {
                answer: "",
                citations: [],
                status: "loading" as const,
              };
              docCells[query] = {
                ...current,
                answer: current.answer + event.token,
                status: "loading",
              };
            } else if (event.type === "done") {
              docCells[query] = {
                answer: event.answer,
                citations: event.citations,
                status: "complete",
                model: event.model,
                fallback: event.fallback,
                duration_ms: event.duration_ms,
              };
            } else if (event.type === "error") {
              docCells[query] = {
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
    [dealId, documents]
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

  // Column management handlers
  const removeQuery = useCallback((index: number) => {
    setQueries((prev) => {
      const query = prev[index];
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

  const renameQuery = useCallback(
    (index: number, newName: string) => {
      const trimmed = newName.trim();
      const oldQuery = queries[index];
      if (!oldQuery || !trimmed || oldQuery === trimmed) return;
      if (queries.includes(trimmed)) return;
      if (documents.length === 0) return;

      // The old query's results no longer apply — cancel its in-flight stream
      controllersRef.current.get(oldQuery)?.abort();
      controllersRef.current.delete(oldQuery);

      setQueries((prev) => {
        const next = [...prev];
        next[index] = trimmed;
        return next;
      });
      setColWidths((prev) => {
        if (!(oldQuery in prev)) return prev;
        const { [oldQuery]: w, ...rest } = prev;
        return { ...rest, [trimmed]: w };
      });
      setCells((prev) => {
        const next = { ...prev };
        for (const doc of documents) {
          const docCells = { ...(next[doc.doc_id] || {}) };
          delete docCells[oldQuery];
          docCells[trimmed] = { answer: "", citations: [], status: "loading" };
          next[doc.doc_id] = docCells;
        }
        return next;
      });

      runQueryStream(trimmed);
    },
    [queries, documents, runQueryStream]
  );

  const reorderQueries = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setQueries((prev) => {
      const newQueries = [...prev];
      const [moved] = newQueries.splice(fromIndex, 1);
      newQueries.splice(toIndex, 0, moved);
      return newQueries;
    });
  }, []);

  const startRename = (index: number) => {
    setEditingColIndex(index);
    setEditingColValue(queries[index]);
  };

  const commitRename = () => {
    if (editingColIndex === null) {
      setEditingColValue("");
      return;
    }
    const idx = editingColIndex;
    const trimmed = editingColValue.trim();
    // Close edit mode immediately so onBlur can't re-fire while a confirm dialog is up
    setEditingColIndex(null);
    setEditingColValue("");

    const oldQuery = queries[idx];
    if (!trimmed || !oldQuery || oldQuery === trimmed) return;
    if (queries.includes(trimmed)) return;

    // Confirm before discarding committed answers; loading-only columns re-run silently.
    const hasCompleteAnswers = documents.some(
      (doc) => cells[doc.doc_id]?.[oldQuery]?.status === "complete"
    );
    if (hasCompleteAnswers) {
      setPendingRename({ index: idx, oldQuery, newName: trimmed });
    } else {
      renameQuery(idx, trimmed);
    }
  };

  const handleColDragStart = (index: number) => {
    setDragColIndex(index);
  };

  const handleColDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverColIndex(index);
  };

  const handleColDrop = (index: number) => {
    if (dragColIndex !== null) {
      reorderQueries(dragColIndex, index);
    }
    setDragColIndex(null);
    setDragOverColIndex(null);
  };

  const handleColDragEnd = () => {
    setDragColIndex(null);
    setDragOverColIndex(null);
  };

  const addQuery = useCallback(
    (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed || documents.length === 0) return;
      if (queries.includes(trimmed)) return;

      setQueries((prev) => [...prev, trimmed]);

      setCells((prev) => {
        const updated = { ...prev };
        for (const doc of documents) {
          updated[doc.doc_id] = {
            ...(updated[doc.doc_id] || {}),
            [trimmed]: { answer: "", citations: [], status: "loading" },
          };
        }
        return updated;
      });

      runQueryStream(trimmed);
    },
    [documents, queries, runQueryStream]
  );

  const handleAddQuery = useCallback(() => {
    if (newQuery.trim()) {
      addQuery(newQuery.trim());
      setNewQuery("");
    }
  }, [newQuery, addQuery]);

  const handleTemplateSelect = useCallback(
    (query: string) => {
      addQuery(query);
      setShowTemplates(false);
    },
    [addQuery]
  );

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
        <svg
          className="w-12 h-12 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <p className="text-sm font-medium">No documents uploaded yet</p>
        <p className="text-xs mt-1">
          Upload documents using the button above
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {/* Selection info */}
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 px-1">
        <span>
          {documents.length} document{documents.length !== 1 ? "s" : ""} &middot;{" "}
          {queries.length} quer{queries.length !== 1 ? "ies" : "y"}
        </span>
        <div className="flex items-center gap-3">
          <div
            className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-0.5"
            role="group"
            aria-label="Column density"
          >
            <button
              type="button"
              onClick={() => setDensity("compact")}
              aria-pressed={density === "compact"}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                density === "compact"
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-medium"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
              title="Narrower columns, see more at once"
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              aria-pressed={density === "comfortable"}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                density === "comfortable"
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-medium"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
              title="Wider columns, easier to read"
            >
              Comfortable
            </button>
          </div>
          <span className="text-gray-300 dark:text-gray-600">
            Add questions as columns to analyze each document independently
          </span>
        </div>
      </div>

      <div className="overflow-auto rounded-lg shadow dark:shadow-gray-900/50 bg-white dark:bg-gray-900 max-h-[calc(100vh-220px)]">
        <table
          className="border-separate border-spacing-0"
          style={{
            tableLayout: "fixed",
            width: queries.length === 0
              ? "100%"
              : getColWidth("doc", COL_DOC) +
                queries.reduce((sum, q) => sum + getColWidth(q, COL_QUERY), 0) +
                COL_ADD,
          }}
        >
          <colgroup>
            <col style={{ width: getColWidth("doc", COL_DOC) }} />
            {queries.map((q, i) => (
              <col key={i} style={{ width: getColWidth(q, COL_QUERY) }} />
            ))}
            {queries.length === 0 ? <col /> : <col style={{ width: COL_ADD }} />}
          </colgroup>
          <thead>
            <tr>
              {/* Document column header with Excel-like dropdown — sticky top + left (corner) */}
              <th
                className={`p-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-r border-b border-gray-200 dark:border-gray-700 sticky top-0 left-0 z-30 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${isColFiltered("doc") ? "bg-blue-50 dark:bg-blue-950/40" : "bg-gray-100 dark:bg-gray-800"}`}
                onClick={(e) => openColMenu("doc", e.currentTarget)}
              >
                <DocColumnHeaderLabel label="Document" col="doc" sortConfig={sortConfig} filterValue={getColFilter("doc")} />
                <ColResizeHandle
                  active={resizingKey === "doc"}
                  onMouseDown={(e) =>
                    startColResize(e, "doc", getColWidth("doc", COL_DOC))
                  }
                />
              </th>
              {/* Query column headers — sticky top */}
              {queries.map((q, i) => (
                <th
                  key={i}
                  draggable={editingColIndex !== i}
                  onDragStart={() => handleColDragStart(i)}
                  onDragOver={(e) => handleColDragOver(e, i)}
                  onDrop={() => handleColDrop(i)}
                  onDragEnd={handleColDragEnd}
                  className={`p-3 text-left font-medium text-gray-700 dark:text-gray-300 border-r border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 group cursor-grab active:cursor-grabbing transition-colors ${
                    dragColIndex === i ? "opacity-50" : ""
                  } ${
                    dragOverColIndex === i && dragColIndex !== i
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : isColFiltered(i)
                      ? "bg-blue-50/80 dark:bg-blue-950/40"
                      : "bg-gray-100 dark:bg-gray-800"
                  }`}
                >
                  {editingColIndex === i ? (
                    <input
                      type="text"
                      value={editingColValue}
                      onChange={(e) => setEditingColValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") {
                          setEditingColIndex(null);
                          setEditingColValue("");
                        }
                      }}
                      autoFocus
                      className="w-full text-sm px-2 py-1 border border-blue-400 rounded bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-1">
                      <div
                        className="text-sm leading-snug flex-1 min-w-0 cursor-text"
                        onDoubleClick={() => startRename(i)}
                        title="Double-click to rename"
                      >
                        {q}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {/* Sort/filter dropdown trigger */}
                        <button
                          onClick={(e) => { e.stopPropagation(); openColMenu(i, e.currentTarget.closest("th")!); }}
                          className={`p-0.5 rounded transition-colors ${isColFiltered(i) ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100"} hover:text-blue-600 dark:hover:text-blue-400`}
                          title="Sort & filter"
                        >
                          {sortConfig?.col === i ? (
                            <span className="text-xs">{sortConfig.dir === "asc" ? "\u25B2" : "\u25BC"}</span>
                          ) : getColFilter(i) ? (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                        {/* Rename button */}
                        <button
                          onClick={() => startRename(i)}
                          className="p-0.5 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Rename column"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={() => setConfirmDeleteCol(i)}
                          className="p-0.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete column"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  <ColResizeHandle
                    active={resizingKey === q}
                    onMouseDown={(e) =>
                      startColResize(e, q, getColWidth(q, COL_QUERY))
                    }
                  />
                </th>
              ))}
              {/* Add query column — sticky top */}
              <th className="p-3 border-r border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 bg-gray-100 dark:bg-gray-800">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddQuery()}
                    placeholder="Ask a question..."
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    disabled={loading}
                  />
                  <button
                    onClick={handleAddQuery}
                    disabled={loading || !newQuery.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    +
                  </button>
                  <div>
                    <button
                      ref={templateBtnRef}
                      onClick={() => setShowTemplates(!showTemplates)}
                      disabled={loading}
                      className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors disabled:opacity-50"
                      title="Question templates"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                        />
                      </svg>
                    </button>

                    {/* Template dropdown — portaled to body */}
                    {showTemplates &&
                      createPortal(
                        <div
                          ref={templateRef}
                          className="fixed w-96 bg-white dark:bg-gray-900 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-[9999] max-h-[480px] overflow-y-auto"
                          style={{
                            top: dropdownPos.top,
                            left: dropdownPos.left,
                          }}
                        >
                          <div className="p-2.5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              Question Templates
                            </span>
                          </div>
                          {QUERY_TEMPLATES.map((cat) => (
                            <div key={cat.name}>
                              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-1.5 sticky top-10 z-[1]">
                                <span>{cat.icon}</span>
                                {cat.name}
                              </div>
                              {cat.templates.map((t) => (
                                <button
                                  key={t.label}
                                  onClick={() =>
                                    handleTemplateSelect(t.query)
                                  }
                                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0"
                                >
                                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    {t.label}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                    {t.query}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>,
                        document.body
                      )}
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((doc) => (
              <tr key={doc.doc_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {/* Document name cell (sticky left) */}
                <td className="p-3 font-medium border-r border-b border-gray-200 dark:border-gray-700 sticky left-0 z-10 bg-white dark:bg-gray-900">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${fileTypeColor(
                        doc.filename
                      )}`}
                    >
                      {fileTypeIcon(doc.filename)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() =>
                          setViewerState({
                            dealId,
                            filename: doc.filename,
                            page: 1,
                            snippet: "",
                          })
                        }
                        className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block max-w-full text-left"
                        title={doc.filename}
                      >
                        {doc.filename}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                        <span>{doc.page_count} pg</span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span>{doc.chunk_count} chunks</span>
                      </div>
                    </div>
                    {onDeleteDocument && (
                      <button
                        type="button"
                        title={`Delete ${doc.filename}`}
                        aria-label={`Delete ${doc.filename}`}
                        disabled={deletingDocId === doc.doc_id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteDocError(null);
                          setConfirmDeleteDoc(doc);
                        }}
                        className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 hover:border-red-200 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        {deletingDocId === doc.doc_id ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v5" />
                            <path d="M14 11v5" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </td>
                {/* Query result cells */}
                {queries.map((q, i) => (
                  <DocMatrixCell
                    key={i}
                    cell={cells[doc.doc_id]?.[q]}
                    dealId={dealId}
                    activeCitationId={activeCitationId}
                    onCitationClick={(citation, id) => {
                      if (onInspectCitation) onInspectCitation(citation, id);
                      else onViewDocument(citation);
                    }}
                    onRetry={() => retryCell(doc.doc_id, q)}
                  />
                ))}
                {/* Empty cell under add-query column */}
                <td className="border-r border-b border-gray-200 dark:border-gray-700" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Excel-like column filter/sort dropdown — portaled to body */}
      {openMenu !== null &&
        createPortal(
          <DocColumnFilterMenu
            ref={menuRef}
            col={openMenu}
            pos={menuPos}
            sortConfig={sortConfig}
            filterValue={getColFilter(openMenu)}
            placeholder={openMenu === "doc" ? "Filter documents..." : "Filter by answer..."}
            matchInfo={`${filteredDocuments.length} of ${documents.length} rows`}
            onSort={(dir) => {
              setSortConfig(dir ? { col: openMenu, dir } : (sortConfig?.col === openMenu ? null : sortConfig));
              setOpenMenu(null);
            }}
            onFilter={(value) => setColFilter(openMenu, value)}
            onClearAll={() => {
              if (openMenu === "doc") setColFilter("doc", "");
              else setColFilter(openMenu, "");
              if (sortConfig?.col === openMenu) setSortConfig(null);
              setOpenMenu(null);
            }}
            onClearAllGlobal={hasAnyFilter ? () => { setColFilters({}); setSortConfig(null); setOpenMenu(null); } : undefined}
          />,
          document.body
        )}

      {/* Document Viewer slide-over panel */}
      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}

      {/* Confirm delete column dialog */}
      {confirmDeleteCol !== null && (
        <ConfirmDialog
          title="Delete Column"
          message={`Remove the query "${queries[confirmDeleteCol]}" and all its results? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            removeQuery(confirmDeleteCol);
            setConfirmDeleteCol(null);
          }}
          onCancel={() => setConfirmDeleteCol(null)}
        />
      )}

      {confirmDeleteDoc && (
        <ConfirmDialog
          title="Delete Document"
          message={
            deleteDocError ||
            `Remove "${confirmDeleteDoc.filename}" and all of its indexed chunks? This cannot be undone.`
          }
          confirmLabel={deletingDocId === confirmDeleteDoc.doc_id ? "Deleting..." : "Delete"}
          onConfirm={handleDeleteDocument}
          onCancel={() => {
            if (deletingDocId) return;
            setDeleteDocError(null);
            setConfirmDeleteDoc(null);
          }}
        />
      )}

      {/* Confirm rename — discards committed answers and re-runs */}
      {pendingRename && (
        <ConfirmDialog
          title="Re-run with new prompt?"
          message={`This will discard existing answers for "${pendingRename.oldQuery}" and re-run "${pendingRename.newName}" against ${documents.length} document${documents.length !== 1 ? "s" : ""}.`}
          confirmLabel="Re-run"
          cancelLabel="Keep existing"
          onConfirm={() => {
            const { index, newName } = pendingRename;
            setPendingRename(null);
            renameQuery(index, newName);
          }}
          onCancel={() => setPendingRename(null)}
        />
      )}
    </div>
  );
}

// ── Column resize handle ──
// A thin draggable strip on the right edge of a header cell. Stops propagation
// so it doesn't trigger column drag-reorder or the header's filter dropdown.
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
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        userSelect: "none",
        background: active ? "rgba(59, 130, 246, 0.5)" : "transparent",
        transition: "background 120ms",
        zIndex: 5,
      }}
      className="hover:bg-blue-400/40"
    />
  );
}

// ── Matrix Cell for Doc Matrix ──

function DocMatrixCell({
  cell,
  activeCitationId,
  onCitationClick,
  onRetry,
}: {
  cell: DocResult | undefined;
  dealId: string;
  activeCitationId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const cleanAnswer = useMemo(
    () => (cell?.answer ? fixMarkdownTables(stripThinkTags(cell.answer)) : ""),
    [cell?.answer]
  );

  const citations = cell?.citations || [];
  const nonNullCitations = citations.filter((c): c is Citation => c !== null);

  if (!cell || cell.status === "idle") {
    return (
      <td className="p-3 text-gray-400 dark:text-gray-600 text-sm border-r border-b border-gray-200 dark:border-gray-700">
        &mdash;
      </td>
    );
  }

  // Loading with no content yet
  if (cell.status === "loading" && cleanAnswer.length === 0) {
    return (
      <td className="p-3 border-r border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-xs text-gray-400 dark:text-gray-500">Analyzing...</span>
        </div>
      </td>
    );
  }

  // Loading with streaming content (think tags hidden)
  if (cell.status === "loading" && cleanAnswer.length > 0) {
    if (!cleanAnswer) {
      return (
        <td className="p-3 border-r border-b border-gray-200 dark:border-gray-700 text-sm align-top max-w-xs">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <div className="animate-pulse text-xs">Reasoning...</div>
          </div>
        </td>
      );
    }
    return (
      <td className="p-3 border-r border-b border-gray-200 dark:border-gray-700 text-sm align-top max-w-xs">
        <div className="max-w-none text-gray-800 dark:text-gray-200 line-clamp-6">
          <AnswerText
            text={cleanAnswer}
            citations={citations}
            activeCitId={activeCitationId}
            onCit={onCitationClick}
          />
        </div>
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      </td>
    );
  }

  // Error
  if (cell.status === "error") {
    return (
      <td className="p-3 border-r border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-950/30 text-sm align-top group">
        <div className="flex items-start justify-between gap-2">
          <div className="text-red-700 dark:text-red-400 flex-1 min-w-0">
            {cell.answer}
          </div>
          <button
            onClick={onRetry}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-red-300 dark:border-red-800 bg-white dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            title="Re-run this question for this document"
          >
            <RetryIcon />
            Retry
          </button>
        </div>
      </td>
    );
  }

  // Complete
  const clampClass = expanded ? "" : "line-clamp-4";
  return (
    <td className="p-3 border-r border-b border-gray-200 dark:border-gray-700 text-sm max-w-xs align-top group relative">
      <button
        onClick={onRetry}
        className="absolute top-1.5 right-1.5 z-[1] inline-flex items-center justify-center w-6 h-6 rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Re-run this question for this document"
        aria-label="Retry this cell"
      >
        <RetryIcon />
      </button>

      <div
        className={`max-w-none text-gray-800 dark:text-gray-200 ${clampClass}`}
      >
        <AnswerText
          text={cleanAnswer}
          citations={citations}
          activeCitId={activeCitationId}
          onCit={onCitationClick}
        />
      </div>

      {nonNullCitations.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap border-t border-gray-100 pt-2 dark:border-gray-800">
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
            Sources
          </span>
          {nonNullCitations.map((citation, index) => {
            const id = citationId(citation, index);
            return (
              <CitBadge
                key={id}
                cit={citation}
                id={id}
                active={activeCitationId === id}
                onClick={() => onCitationClick(citation, id)}
              />
            );
          })}
        </div>
      )}

      {/* Expand toggle */}
      {cleanAnswer.length > 200 && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}

      {/* Model info */}
      {cell.model && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
          <span
            className={`px-1.5 py-0.5 rounded-full font-mono ${
              cell.fallback
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {cell.model}
          </span>
          {cell.fallback && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">fallback</span>
          )}
          {cell.duration_ms != null && (
            <span>{(cell.duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </td>
  );
}

function RetryIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v6h6M20 20v-6h-6M5.07 9A8 8 0 0119.93 9M18.93 15A8 8 0 014.07 15"
      />
    </svg>
  );
}

// ── Shared sub-components for Excel-like column headers ──

function DocColumnHeaderLabel({
  label,
  col,
  sortConfig,
  filterValue,
}: {
  label: string;
  col: "doc" | number;
  sortConfig: { col: "doc" | number; dir: "asc" | "desc" } | null;
  filterValue: string;
}) {
  const isSorted = sortConfig?.col === col;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {label}
        {isSorted && (
          <span className="text-blue-500 text-xs">
            {sortConfig!.dir === "asc" ? "\u25B2" : "\u25BC"}
          </span>
        )}
        {filterValue && (
          <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

const DocColumnFilterMenu = forwardRef<
  HTMLDivElement,
  {
    col: "doc" | number;
    pos: { top: number; left: number };
    sortConfig: { col: "doc" | number; dir: "asc" | "desc" } | null;
    filterValue: string;
    placeholder: string;
    matchInfo: string;
    onSort: (dir: "asc" | "desc" | null) => void;
    onFilter: (value: string) => void;
    onClearAll: () => void;
    onClearAllGlobal?: () => void;
  }
>(function DocColumnFilterMenu(
  { col, pos, sortConfig, filterValue, placeholder, matchInfo, onSort, onFilter, onClearAll, onClearAllGlobal },
  ref
) {
  const isSortedAsc = sortConfig?.col === col && sortConfig.dir === "asc";
  const isSortedDesc = sortConfig?.col === col && sortConfig.dir === "desc";
  const hasFilter = !!filterValue || isSortedAsc || isSortedDesc;

  return (
    <div
      ref={ref}
      className="fixed w-56 bg-white rounded-lg shadow-2xl border border-gray-200 z-[9999] overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="border-b border-gray-100">
        <button
          onClick={() => onSort(isSortedAsc ? null : "asc")}
          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${isSortedAsc ? "text-blue-600 font-medium bg-blue-50" : "text-gray-700"}`}
        >
          <span className="text-sm">{"\u25B2"}</span> Sort A to Z
        </button>
        <button
          onClick={() => onSort(isSortedDesc ? null : "desc")}
          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${isSortedDesc ? "text-blue-600 font-medium bg-blue-50" : "text-gray-700"}`}
        >
          <span className="text-sm">{"\u25BC"}</span> Sort Z to A
        </button>
      </div>
      <div className="p-2">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={filterValue}
            onChange={(e) => onFilter(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            autoFocus
          />
        </div>
        {filterValue && (
          <div className="mt-1 text-[10px] text-gray-400">{matchInfo}</div>
        )}
      </div>
      {hasFilter && (
        <div className="border-t border-gray-100 p-1 space-y-0.5">
          <button
            onClick={onClearAll}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Clear column filter
          </button>
          {onClearAllGlobal && (
            <button
              onClick={onClearAllGlobal}
              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
});
