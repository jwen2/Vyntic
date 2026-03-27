"use client";
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  Children,
  isValidElement,
  cloneElement,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DocumentMetadata,
  Citation,
  DocMatrixEvent,
  docMatrixStream,
} from "@/lib/api";
import { QUERY_TEMPLATES } from "@/lib/queryTemplates";
import InlineCitation from "./InlineCitation";
import DocumentViewer from "./DocumentViewer";
import ConfirmDialog from "./ConfirmDialog";

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
}

// ── Helpers ──

const SOURCE_PATTERN = /\[Source\s+(\d+)\]/g;

function renderTextWithCitations(
  text: string,
  citations: (Citation | null)[],
  onViewDocument?: (citation: Citation) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(SOURCE_PATTERN);

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const idx = parseInt(match[1], 10);
    parts.push(
      <InlineCitation
        key={`src-${match.index}`}
        index={idx}
        citation={citations[idx - 1]}
        onViewDocument={onViewDocument}
      />
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function processCitations(
  children: React.ReactNode,
  citations: (Citation | null)[],
  onViewDocument?: (citation: Citation) => void
): React.ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      if (new RegExp(SOURCE_PATTERN).test(child)) {
        return <>{renderTextWithCitations(child, citations, onViewDocument)}</>;
      }
      return child;
    }
    if (
      isValidElement(child) &&
      child.props &&
      (child.props as Record<string, unknown>).children
    ) {
      const nested = (child.props as Record<string, unknown>)
        .children as React.ReactNode;
      const processed = processCitations(nested, citations, onViewDocument);
      return cloneElement(child, {}, processed);
    }
    return child;
  });
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
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

  const handleCitationClick = useCallback(
    (citation: Citation) => {
      onViewDocument(citation);
    },
    [onViewDocument]
  );

  const handleLocalCitationClick = useCallback((citation: Citation) => {
    setViewerState({
      dealId: citation.deal_id || "",
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
  }, []);

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
              {/* Document column header */}
              <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 min-w-[220px] sticky left-0 bg-gray-100 dark:bg-gray-800 z-10">
                Document
              </th>
              {/* Query column headers */}
              {queries.map((q, i) => (
                <th
                  key={i}
                  draggable
                  onDragStart={() => handleColDragStart(i)}
                  onDragOver={(e) => handleColDragOver(e, i)}
                  onDrop={() => handleColDrop(i)}
                  onDragEnd={handleColDragEnd}
                  className={`p-3 text-left font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 min-w-[280px] max-w-[400px] group cursor-grab active:cursor-grabbing transition-colors ${
                    dragColIndex === i ? "opacity-50" : ""
                  } ${dragOverColIndex === i && dragColIndex !== i ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
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
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => startRename(i)}
                          className="p-0.5 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded"
                          title="Rename column"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteCol(i)}
                          className="p-0.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded"
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
            {documents.map((doc) => (
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
                    onCitationClick={handleLocalCitationClick}
                  />
                ))}
                {/* Empty cell under add-query column */}
                <td className="border border-gray-200 dark:border-gray-700" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  dealId,
  onCitationClick,
}: {
  cell: DocResult | undefined;
  dealId: string;
  onCitationClick: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const cleanAnswer = useMemo(
    () => (cell?.answer ? stripThinkTags(cell.answer) : ""),
    [cell?.answer]
  );

  const handleViewDocument = useCallback(
    (citation: Citation) => {
      onCitationClick(citation);
    },
    [onCitationClick]
  );

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
        <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 line-clamp-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cleanAnswer}
          </ReactMarkdown>
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
  const sourceCount = cell.citations?.filter((c) => c !== null).length || 0;

  return (
    <td className="p-3 border border-gray-200 dark:border-gray-700 text-sm max-w-xs align-top">
      <div
        className={`prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 ${clampClass}`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="not-prose overflow-x-auto my-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
                <table className="text-xs border-collapse w-full min-w-[280px]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-gray-800 dark:to-gray-800/80">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="border-b border-r border-gray-200 dark:border-gray-700 last:border-r-0 px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {children}
              </th>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-slate-50/40 dark:even:bg-gray-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                {children}
              </tr>
            ),
            td: ({ children }) => (
              <td className="border-r border-gray-100 dark:border-gray-800 last:border-r-0 px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                {processCitations(
                  children,
                  cell.citations,
                  handleViewDocument
                )}
              </td>
            ),
            p: ({ children }) => (
              <p className="my-1.5 text-sm leading-relaxed">
                {processCitations(
                  children,
                  cell.citations,
                  handleViewDocument
                )}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="my-1.5 ml-4 list-disc space-y-0.5 text-sm">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-sm">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-sm leading-relaxed">
                {processCitations(
                  children,
                  cell.citations,
                  handleViewDocument
                )}
              </li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-gray-900 dark:text-gray-100">
                {children}
              </strong>
            ),
          }}
        >
          {cleanAnswer}
        </ReactMarkdown>
      </div>

      {/* Source count + expand */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {sourceCount > 0 && (
          <span className="text-[10px] text-blue-500 dark:text-blue-400">
            {sourceCount} source{sourceCount > 1 ? "s" : ""}
          </span>
        )}
        {cleanAnswer.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

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
