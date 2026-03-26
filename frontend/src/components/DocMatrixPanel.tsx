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
  if (ext === "pdf") return "bg-red-100 text-red-700";
  if (ext === "xlsx" || ext === "xls") return "bg-emerald-100 text-emerald-700";
  if (ext === "csv") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
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
      // Open in the page-level viewer via onViewDocument
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

  const addQuery = useCallback(
    (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed || documents.length === 0) return;
      if (queries.includes(trimmed)) return; // no duplicate columns

      setQueries((prev) => [...prev, trimmed]);

      // Initialize cells for all docs as loading
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
        // onEvent
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
        // onFinish
        () => setLoading(false),
        // onError
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
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
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
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>
          {documents.length} document{documents.length !== 1 ? "s" : ""} &middot;{" "}
          {queries.length} quer{queries.length !== 1 ? "ies" : "y"}
        </span>
        <span className="text-gray-300">
          Add questions as columns to analyze each document independently
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow">
          <thead>
            <tr className="bg-gray-100">
              {/* Document column header */}
              <th className="p-3 text-left font-semibold text-gray-700 border border-gray-200 min-w-[220px] sticky left-0 bg-gray-100 z-10">
                Document
              </th>
              {/* Query column headers */}
              {queries.map((q, i) => (
                <th
                  key={i}
                  className="p-3 text-left font-medium text-gray-700 border border-gray-200 min-w-[280px] max-w-[400px]"
                >
                  <div className="text-sm leading-snug">{q}</div>
                </th>
              ))}
              {/* Add query column */}
              <th className="p-3 border border-gray-200 min-w-[320px]">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddQuery()}
                    placeholder="Ask a question..."
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
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
                      className="px-2 py-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
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
                          className="fixed w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-[9999] max-h-[480px] overflow-y-auto"
                          style={{
                            top: dropdownPos.top,
                            left: dropdownPos.left,
                          }}
                        >
                          <div className="p-2.5 border-b border-gray-100 sticky top-0 bg-white z-10">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Question Templates
                            </span>
                          </div>
                          {QUERY_TEMPLATES.map((cat) => (
                            <div key={cat.name}>
                              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 flex items-center gap-1.5 sticky top-10 z-[1]">
                                <span>{cat.icon}</span>
                                {cat.name}
                              </div>
                              {cat.templates.map((t) => (
                                <button
                                  key={t.label}
                                  onClick={() =>
                                    handleTemplateSelect(t.query)
                                  }
                                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                                >
                                  <div className="text-sm font-medium text-gray-800">
                                    {t.label}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
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
              <tr key={doc.doc_id} className="hover:bg-gray-50 transition-colors">
                {/* Document name cell (sticky left) */}
                <td className="p-3 font-medium border border-gray-200 sticky left-0 z-10 bg-white">
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
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors truncate block max-w-full text-left"
                        title={doc.filename}
                      >
                        {doc.filename}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                        <span>{doc.page_count} pg</span>
                        <span className="text-gray-300">|</span>
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
                <td className="border border-gray-200" />
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
      <td className="p-3 text-gray-400 text-sm border border-gray-200">
        &mdash;
      </td>
    );
  }

  // Loading with no content yet
  if (cell.status === "loading" && cleanAnswer.length === 0) {
    return (
      <td className="p-3 border border-gray-200">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-xs text-gray-400">Analyzing...</span>
        </div>
      </td>
    );
  }

  // Loading with streaming content (think tags hidden)
  if (cell.status === "loading" && cleanAnswer.length > 0) {
    if (!cleanAnswer) {
      return (
        <td className="p-3 border border-gray-200 text-sm align-top max-w-xs">
          <div className="flex items-center gap-2 text-amber-600">
            <div className="animate-pulse text-xs">Reasoning...</div>
          </div>
        </td>
      );
    }
    return (
      <td className="p-3 border border-gray-200 text-sm align-top max-w-xs">
        <div className="prose prose-sm max-w-none text-gray-800 line-clamp-6">
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
      <td className="p-3 border border-gray-200 bg-red-50 text-red-700 text-sm">
        {cell.answer}
      </td>
    );
  }

  // Complete
  const clampClass = expanded ? "" : "line-clamp-4";
  const sourceCount = cell.citations?.filter((c) => c !== null).length || 0;

  return (
    <td className="p-3 border border-gray-200 text-sm max-w-xs align-top">
      <div
        className={`prose prose-sm max-w-none text-gray-800 ${clampClass}`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="not-prose overflow-x-auto my-2 rounded-lg border border-gray-200 shadow-sm bg-white">
                <table className="text-xs border-collapse w-full min-w-[280px]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-gradient-to-b from-slate-50 to-slate-100/80">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="border-b border-r border-gray-200 last:border-r-0 px-3 py-2 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
                {children}
              </th>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-slate-50/40 hover:bg-blue-50/30 transition-colors border-b border-gray-100 last:border-b-0">
                {children}
              </tr>
            ),
            td: ({ children }) => (
              <td className="border-r border-gray-100 last:border-r-0 px-3 py-2 text-xs text-gray-700">
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
              <strong className="font-semibold text-gray-900">
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
          <span className="text-[10px] text-blue-500">
            {sourceCount} source{sourceCount > 1 ? "s" : ""}
          </span>
        )}
        {cleanAnswer.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Model info */}
      {cell.model && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
          <span
            className={`px-1.5 py-0.5 rounded-full font-mono ${
              cell.fallback
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {cell.model}
          </span>
          {cell.fallback && (
            <span className="text-amber-600 font-medium">fallback</span>
          )}
          {cell.duration_ms != null && (
            <span>{(cell.duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </td>
  );
}
