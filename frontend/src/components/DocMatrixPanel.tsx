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
import {
  FORMAT_OPTIONS,
  PE_COLUMN_PRESETS,
  TAG_COLORS,
  buildFallbackPrompt,
  createColumnId,
  getFormatShort,
  getPillClass,
  getPresetConfig,
  type ColumnFormat,
  type MatrixColumnConfig,
} from "@/lib/matrixColumnConfig";

// ── Types ──

interface DocResult {
  answer: string;
  citations: (Citation | null)[];
  status: "idle" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

interface ColumnDraft {
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags: string[];
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

function isPillOnlyAnswer(text: string): boolean {
  const stripped = text.trim();
  if (!stripped || stripped.includes("page:")) return false;
  return /^(\[\[[^\]]+\]\]\s*)+$/.test(stripped);
}

function extractPills(text: string): string[] {
  const pills: string[] = [];
  const pattern = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const content = match[1];
    if (!content.startsWith("page:")) pills.push(content);
  }
  return pills;
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
  const [columns, setColumns] = useState<MatrixColumnConfig[]>([]);
  const queries = useMemo(() => columns.map((column) => column.id), [columns]);
  const columnById = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.id, column])),
    [columns]
  );
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

  const [gridSearchOpen, setGridSearchOpen] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);
  const [pendingColumnUpdate, setPendingColumnUpdate] = useState<MatrixColumnConfig | null>(null);
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  // Per-column width overrides (key: "doc" or the query string).
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);

  // Document-column sort menu
  const [openMenu, setOpenMenu] = useState<"doc" | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{ col: "doc"; dir: "asc" | "desc" } | null>(null);

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

  const COL_DOC = 240;
  const COL_QUERY = 720;
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

  const filteredDocuments = useMemo(() => {
    let result = documents;

    const search = gridSearch.trim().toLowerCase();
    if (search) {
      result = result.filter((doc) => {
        const docHaystack = [
          doc.filename,
          `${doc.page_count} pages`,
          `${doc.chunk_count} chunks`,
        ].join(" ").toLowerCase();
        if (docHaystack.includes(search)) return true;

        return columns.some((column) => {
          const cell = cells[doc.doc_id]?.[column.id];
          if (!cell) return false;
          const citationText = (cell.citations || [])
            .filter(Boolean)
            .map((citation) =>
              `${citation?.source_file || ""} ${citation?.page || ""} ${citation?.text_snippet || ""}`
            )
            .join(" ");
          return [
            cell.answer,
            citationText,
          ].join(" ").toLowerCase().includes(search);
        });
      });
    }

    // Apply sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a.filename;
        const bVal = b.filename;
        return sortConfig.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }
    return result;
  }, [documents, gridSearch, sortConfig, columns, cells]);

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
  const openColMenu = (thElement: HTMLElement) => {
    if (openMenu === "doc") {
      setOpenMenu(null);
      return;
    }
    const rect = thElement.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 2, left: rect.left });
    setOpenMenu("doc");
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
      columnId: string,
      opts?: { docIds?: string[]; controllerKey?: string }
    ) => {
      const column = columnById[columnId];
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

  // Column management handlers
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
      runQueryStream(nextColumn.id);
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

  const reorderQueries = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setColumns((prev) => {
      const newColumns = [...prev];
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      return newColumns;
    });
  }, []);

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

      runQueryStream(column.id);
    },
    [columns, documents, runQueryStream]
  );

  const handleAddQuery = useCallback(() => {
    if (newQuery.trim()) {
      addQuery(newQuery.trim());
      setNewQuery("");
    }
  }, [newQuery, addQuery]);

  const handleTemplateSelect = useCallback(
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
      runQueryStream(column.id);
      setShowTemplates(false);
    },
    [columns, documents, runQueryStream]
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

  const tableMinWidth =
    getColWidth("doc", COL_DOC) +
    queries.reduce((sum, q) => sum + getColWidth(q, COL_QUERY), 0) +
    COL_ADD;
  const tableWidth = queries.length === 0 ? "100%" : `max(100%, ${tableMinWidth}px)`;

  return (
    <div className="space-y-2 p-4">
      {/* Selection info */}
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 px-1">
        <span>
          {documents.length} document{documents.length !== 1 ? "s" : ""} &middot;{" "}
          {queries.length} quer{queries.length !== 1 ? "ies" : "y"}
          {gridSearch.trim() && (
            <>
              {" "}&middot; {filteredDocuments.length} match{filteredDocuments.length !== 1 ? "es" : ""}
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          {gridSearchOpen && (
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                placeholder="Filter grid..."
                className="w-56 pl-7 pr-7 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
              />
              {gridSearch && (
                <button
                  type="button"
                  onClick={() => setGridSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  title="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setGridSearchOpen((open) => {
                if (open) setGridSearch("");
                return !open;
              });
            }}
            className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors ${
              gridSearchOpen || gridSearch.trim()
                ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-400"
                : "border-gray-200 bg-white text-gray-500 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-400"
            }`}
            title={gridSearchOpen ? "Close grid filter" : "Search and filter grid"}
            aria-label={gridSearchOpen ? "Close grid filter" : "Search and filter grid"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg shadow dark:shadow-gray-900/50 bg-white dark:bg-gray-900 max-h-[calc(100vh-220px)]">
        <table
          className="border-separate border-spacing-0"
          style={{
            tableLayout: "fixed",
            width: tableWidth,
          }}
        >
          <colgroup>
            <col style={{ width: getColWidth("doc", COL_DOC) }} />
            {queries.map((q, i) => (
              <col key={i} style={{ width: getColWidth(q, COL_QUERY) }} />
            ))}
            <col />
          </colgroup>
          <thead>
            <tr>
              {/* Document column header with Excel-like dropdown — sticky top + left (corner) */}
              <th
                className={`p-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-r border-b border-gray-200 dark:border-gray-700 sticky top-0 left-0 z-30 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${sortConfig?.col === "doc" ? "bg-blue-50 dark:bg-blue-950/40" : "bg-gray-100 dark:bg-gray-800"}`}
                onClick={(e) => openColMenu(e.currentTarget)}
              >
                <DocColumnHeaderLabel label="Document" sortConfig={sortConfig} />
                <ColResizeHandle
                  active={resizingKey === "doc"}
                  onMouseDown={(e) =>
                    startColResize(e, "doc", getColWidth("doc", COL_DOC))
                  }
                />
              </th>
              {/* Query column headers — sticky top */}
              {columns.map((column, i) => {
                const q = column.id;
                return (
                <th
                  key={i}
                  draggable
                  onDragStart={() => handleColDragStart(i)}
                  onDragOver={(e) => handleColDragOver(e, i)}
                  onDrop={() => handleColDrop(i)}
                  onDragEnd={handleColDragEnd}
                  className={`p-3 text-left font-medium text-gray-700 dark:text-gray-300 border-r border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 group cursor-grab active:cursor-grabbing transition-colors ${
                    dragColIndex === i ? "opacity-50" : ""
                  } ${
                    dragOverColIndex === i && dragColIndex !== i
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "bg-gray-100 dark:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                      <div className="text-sm leading-snug flex-1 min-w-0">
                        <div className="truncate">{column.label}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded bg-gray-200/70 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                            {getFormatShort(column.format)}
                          </span>
                          {column.prompt !== column.label && (
                            <span className="truncate text-[10px] font-normal text-gray-400 dark:text-gray-500">
                              {column.prompt}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <DocColumnEditMenu
                          column={column}
                          disabled={loading}
                          onSave={saveColumn}
                          onDelete={() => setConfirmDeleteCol(i)}
                        />
                      </div>
                    </div>
                  <ColResizeHandle
                    active={resizingKey === q}
                    onMouseDown={(e) =>
                      startColResize(e, q, getColWidth(q, COL_QUERY))
                    }
                  />
                </th>
                );
              })}
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
                              Column Templates
                            </span>
                          </div>
                          <div>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-1.5 sticky top-10 z-[1]">
                              <span>PE</span>
                              Diligence columns
                            </div>
                            {PE_COLUMN_PRESETS.map((preset) => (
                              <button
                                key={preset.name}
                                onClick={() =>
                                  handleTemplateSelect(
                                    preset.name,
                                    preset.prompt,
                                    preset.format,
                                    preset.tags
                                  )
                                }
                                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    {preset.name}
                                  </span>
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                    {getFormatShort(preset.format)}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                  {preset.prompt}
                                </div>
                              </button>
                            ))}
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
                                  onClick={() => handleTemplateSelect(t.label, t.query)}
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
                {columns.map((column, i) => (
                  <DocMatrixCell
                    key={i}
                    cell={cells[doc.doc_id]?.[column.id]}
                    column={column}
                    dealId={dealId}
                    activeCitationId={activeCitationId}
                    onCitationClick={(citation, id) => {
                      if (onInspectCitation) onInspectCitation(citation, id);
                      else onViewDocument(citation);
                    }}
                    onRetry={() => retryCell(doc.doc_id, column.id)}
                  />
                ))}
                {/* Empty cell under add-query column */}
                <td className="border-r border-b border-gray-200 dark:border-gray-700" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Document column sort dropdown — portaled to body */}
      {openMenu !== null &&
        createPortal(
          <DocColumnSortMenu
            ref={menuRef}
            pos={menuPos}
            sortConfig={sortConfig}
            onSort={(dir) => {
              setSortConfig(dir ? { col: "doc", dir } : null);
              setOpenMenu(null);
            }}
            onClear={() => {
              setSortConfig(null);
              setOpenMenu(null);
            }}
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
          message={`Remove "${columns[confirmDeleteCol]?.label || "this column"}" and all its results? This cannot be undone.`}
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

      {/* Confirm prompt change — discards committed answers and re-runs */}
      {pendingColumnUpdate && (
        <ConfirmDialog
          title="Re-run with updated prompt?"
          message={`This will discard existing answers for "${pendingColumnUpdate.label}" and re-run the updated prompt against ${documents.length} document${documents.length !== 1 ? "s" : ""}.`}
          confirmLabel="Re-run"
          cancelLabel="Keep existing"
          onConfirm={() => {
            const column = pendingColumnUpdate;
            setPendingColumnUpdate(null);
            applyColumnUpdate(column, true);
          }}
          onCancel={() => setPendingColumnUpdate(null)}
        />
      )}
    </div>
  );
}

function DocColumnEditMenu({
  column,
  disabled,
  onSave,
  onDelete,
}: {
  column: MatrixColumnConfig;
  disabled?: boolean;
  onSave: (column: MatrixColumnConfig) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnDraft>({
    label: column.label,
    prompt: column.prompt,
    format: column.format,
    tags: column.tags || [],
  });
  const [tagInput, setTagInput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setDraft({
        label: column.label,
        prompt: column.prompt,
        format: column.format,
        tags: column.tags || [],
      });
      setTagInput("");
    }
  }, [column, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function updateDraft(patch: Partial<ColumnDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function applyPreset(name: string) {
    const preset = PE_COLUMN_PRESETS.find((item) => item.name === name);
    if (!preset) return;
    updateDraft({
      label: preset.name,
      prompt: preset.prompt,
      format: preset.format,
      tags: preset.tags || [],
    });
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

  function commitTag() {
    const tag = tagInput.trim();
    if (!tag) {
      setTagInput("");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags : [...prev.tags, tag],
    }));
    setTagInput("");
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTag();
      return;
    }
    if (event.key === "Backspace" && tagInput === "" && draft.tags.length > 0) {
      updateDraft({ tags: draft.tags.slice(0, -1) });
    }
  }

  function handleSave() {
    const label = draft.label.trim();
    const prompt = draft.prompt.trim();
    if (!label || !prompt) return;
    onSave({
      ...column,
      label,
      prompt,
      format: draft.format,
      tags: draft.format === "tag" ? draft.tags : undefined,
    });
    setOpen(false);
  }

  return (
    <div className="relative" ref={panelRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="p-0.5 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
        title="Edit label, prompt, and format"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6h.01M12 12h.01M12 18h.01" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-1.5 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit column</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              aria-label="Close column editor"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Label</label>
          <input
            value={draft.label}
            onChange={(event) => {
              const label = event.target.value;
              const preset = getPresetConfig(label);
              updateDraft({
                label,
                ...(preset
                  ? { prompt: preset.prompt, format: preset.format, tags: preset.tags || [] }
                  : {}),
              });
            }}
            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Format</label>
              <select
                value={draft.format}
                onChange={(event) =>
                  updateDraft({
                    format: event.target.value as ColumnFormat,
                    tags: event.target.value === "tag" ? draft.tags : [],
                  })
                }
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              >
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Preset</label>
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) applyPreset(event.target.value);
                }}
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              >
                <option value="">Choose...</option>
                {PE_COLUMN_PRESETS.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {draft.format === "tag" && (
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tags</label>
              <div className="mt-1 flex min-h-[32px] flex-wrap gap-1 rounded-md border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                {draft.tags.map((tag, tagIdx) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${TAG_COLORS[tagIdx % TAG_COLORS.length]}`}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => updateDraft({ tags: draft.tags.filter((item) => item !== tag) })}
                      className="text-current opacity-60 hover:opacity-100"
                    >
                      x
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={commitTag}
                  placeholder={draft.tags.length === 0 ? "Add tag..." : ""}
                  className="min-w-[70px] flex-1 bg-transparent text-xs text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Prompt</label>
            <button
              type="button"
              onClick={autoGeneratePrompt}
              disabled={!draft.label.trim()}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-300 dark:text-blue-400"
            >
              Auto-generate
            </button>
          </div>
          <textarea
            rows={6}
            value={draft.prompt}
            onChange={(event) => updateDraft({ prompt: event.target.value })}
            className="mt-1 w-full resize-none rounded-md border border-gray-200 bg-white px-2 py-2 text-xs leading-relaxed text-gray-900 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onDelete}
              className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.label.trim() || !draft.prompt.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
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
  column,
  activeCitationId,
  onCitationClick,
  onRetry,
}: {
  cell: DocResult | undefined;
  column?: MatrixColumnConfig;
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
  const pillValues = column ? extractPills(cleanAnswer) : [];
  const showPillSummary = !!column && isPillOnlyAnswer(cleanAnswer) && pillValues.length > 0;

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

      {showPillSummary ? (
        <div className="flex flex-wrap gap-1.5 pr-6">
          {pillValues.map((pill) => (
            <span
              key={pill}
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getPillClass(pill, column)}`}
            >
              {pill}
            </span>
          ))}
        </div>
      ) : (
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
      )}

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
  sortConfig,
}: {
  label: string;
  sortConfig: { col: "doc"; dir: "asc" | "desc" } | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {label}
        {sortConfig && (
          <span className="text-blue-500 text-xs">
            {sortConfig.dir === "asc" ? "\u25B2" : "\u25BC"}
          </span>
        )}
      </div>
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

const DocColumnSortMenu = forwardRef<
  HTMLDivElement,
  {
    pos: { top: number; left: number };
    sortConfig: { col: "doc"; dir: "asc" | "desc" } | null;
    onSort: (dir: "asc" | "desc" | null) => void;
    onClear: () => void;
  }
>(function DocColumnSortMenu(
  { pos, sortConfig, onSort, onClear },
  ref
) {
  const isSortedAsc = sortConfig?.dir === "asc";
  const isSortedDesc = sortConfig?.dir === "desc";

  return (
    <div
      ref={ref}
      className="fixed w-44 bg-white rounded-lg shadow-2xl border border-gray-200 z-[9999] overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div>
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
      {(isSortedAsc || isSortedDesc) && (
        <div className="border-t border-gray-100 p-1 space-y-0.5">
          <button
            onClick={onClear}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Clear sort
          </button>
        </div>
      )}
    </div>
  );
});
