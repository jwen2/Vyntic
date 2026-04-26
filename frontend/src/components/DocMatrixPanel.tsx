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
  const controllerRef = useRef<AbortController | null>(null);

  // Column management state
  const [editingColIndex, setEditingColIndex] = useState<number | null>(null);
  const [editingColValue, setEditingColValue] = useState("");
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  // Unified Excel-like header filter/sort for all columns
  const [openMenu, setOpenMenu] = useState<"doc" | number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{ col: "doc" | number; dir: "asc" | "desc" } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

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
    return () => {
      controllerRef.current?.abort();
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

  // Column management handlers
  const removeQuery = useCallback((index: number) => {
    setQueries((prev) => {
      const query = prev[index];
      if (!query) return prev;
      setCells((prevCells) => {
        const newCells = { ...prevCells };
        for (const docId of Object.keys(newCells)) {
          const docCells = { ...newCells[docId] };
          delete docCells[query];
          newCells[docId] = docCells;
        }
        return newCells;
      });
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const renameQuery = useCallback((index: number, newName: string) => {
    setQueries((prev) => {
      const oldQuery = prev[index];
      if (!oldQuery || !newName.trim() || oldQuery === newName) return prev;
      if (prev.includes(newName)) return prev;
      const newQueries = [...prev];
      newQueries[index] = newName;
      setCells((prevCells) => {
        const newCells = { ...prevCells };
        for (const docId of Object.keys(newCells)) {
          const docCells = { ...newCells[docId] };
          if (docCells[oldQuery]) {
            docCells[newName] = docCells[oldQuery];
            delete docCells[oldQuery];
          }
          newCells[docId] = docCells;
        }
        return newCells;
      });
      return newQueries;
    });
  }, []);

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
    if (editingColIndex !== null && editingColValue.trim()) {
      renameQuery(editingColIndex, editingColValue.trim());
    }
    setEditingColIndex(null);
    setEditingColValue("");
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

      setLoading(true);

      const docIds = documents.map((d) => d.doc_id);

      const controller = docMatrixStream(
        dealId,
        docIds,
        trimmed,
        (event: DocMatrixEvent) => {
          setCells((prev) => {
            const updated = { ...prev };
            const docCells = { ...(updated[event.doc_id] || {}) };

            if (event.type === "token") {
              const current = docCells[trimmed] || {
                answer: "",
                citations: [],
                status: "loading" as const,
              };
              docCells[trimmed] = {
                ...current,
                answer: current.answer + event.token,
                status: "loading",
              };
            } else if (event.type === "done") {
              docCells[trimmed] = {
                answer: event.answer,
                citations: event.citations,
                status: "complete",
                model: event.model,
                fallback: event.fallback,
                duration_ms: event.duration_ms,
              };
            } else if (event.type === "error") {
              docCells[trimmed] = {
                answer: event.error,
                citations: [],
                status: "error",
              };
            }

            updated[event.doc_id] = docCells;
            return updated;
          });
        },
        () => setLoading(false),
        (err) => {
          console.error("Doc matrix stream error:", err);
          setLoading(false);
        }
      );

      controllerRef.current = controller;
    },
    [dealId, documents, queries]
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
        <span className="text-gray-300 dark:text-gray-600">
          Add questions as columns to analyze each document independently
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-900/50">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              {/* Document column header with Excel-like dropdown */}
              <th
                className={`p-3 text-left font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 min-w-[220px] sticky left-0 z-10 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${isColFiltered("doc") ? "bg-blue-50 dark:bg-blue-950/40" : "bg-gray-100 dark:bg-gray-800"}`}
                onClick={(e) => openColMenu("doc", e.currentTarget)}
              >
                <DocColumnHeaderLabel label="Document" col="doc" sortConfig={sortConfig} filterValue={getColFilter("doc")} />
              </th>
              {/* Query column headers */}
              {queries.map((q, i) => (
                <th
                  key={i}
                  draggable={editingColIndex !== i}
                  onDragStart={() => handleColDragStart(i)}
                  onDragOver={(e) => handleColDragOver(e, i)}
                  onDrop={() => handleColDrop(i)}
                  onDragEnd={handleColDragEnd}
                  className={`p-3 text-left font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 min-w-[280px] max-w-[400px] group cursor-grab active:cursor-grabbing transition-colors ${
                    dragColIndex === i ? "opacity-50" : ""
                  } ${dragOverColIndex === i && dragColIndex !== i ? "bg-blue-50 dark:bg-blue-950/40" : ""} ${
                    isColFiltered(i) ? "bg-blue-50/50 dark:bg-blue-950/30" : ""
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
                </th>
              ))}
              {/* Add query column */}
              <th className="p-3 border border-gray-200 dark:border-gray-700 min-w-[320px]">
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
                <td className="p-3 font-medium border border-gray-200 dark:border-gray-700 sticky left-0 z-10 bg-white dark:bg-gray-900">
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
                  />
                ))}
                {/* Empty cell under add-query column */}
                <td className="border border-gray-200 dark:border-gray-700" />
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
    </div>
  );
}

// ── Matrix Cell for Doc Matrix ──

function DocMatrixCell({
  cell,
  activeCitationId,
  onCitationClick,
}: {
  cell: DocResult | undefined;
  dealId: string;
  activeCitationId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
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
      <td className="p-3 text-gray-400 dark:text-gray-600 text-sm border border-gray-200 dark:border-gray-700">
        &mdash;
      </td>
    );
  }

  // Loading with no content yet
  if (cell.status === "loading" && cleanAnswer.length === 0) {
    return (
      <td className="p-3 border border-gray-200 dark:border-gray-700">
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
        <td className="p-3 border border-gray-200 dark:border-gray-700 text-sm align-top max-w-xs">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <div className="animate-pulse text-xs">Reasoning...</div>
          </div>
        </td>
      );
    }
    return (
      <td className="p-3 border border-gray-200 dark:border-gray-700 text-sm align-top max-w-xs">
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
      <td className="p-3 border border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm">
        {cell.answer}
      </td>
    );
  }

  // Complete
  const clampClass = expanded ? "" : "line-clamp-4";
  return (
    <td className="p-3 border border-gray-200 dark:border-gray-700 text-sm max-w-xs align-top">
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
