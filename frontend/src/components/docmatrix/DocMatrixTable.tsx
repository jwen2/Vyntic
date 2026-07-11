import { forwardRef, memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentMetadata, Citation } from "@/lib/api";
import { QUERY_TEMPLATES } from "@/lib/queryTemplates";
import {
  PE_COLUMN_PRESETS,
  getFormatShort,
  type ColumnFormat,
  type MatrixColumnConfig,
} from "@/lib/matrixColumnConfig";
import DocMatrixCell from "./DocMatrixCell";
import ColumnConfigPopover from "./ColumnConfigPopover";
import type { DocResult, SortConfig } from "./useDocMatrix";

const COL_DOC = 240;
const COL_QUERY = 720;
const COL_ADD = 360;

// ── File-type chip helpers ──

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

interface DocMatrixTableProps {
  columns: MatrixColumnConfig[];
  documents: DocumentMetadata[];
  cells: Record<string, Record<string, DocResult>>;
  loading: boolean;
  dealId: string;
  activeCitationId: string | null;
  getColWidth: (key: string, fallback: number) => number;
  resizingKey: string | null;
  onColResize: (e: React.MouseEvent, key: string, startWidth: number) => void;
  sortConfig: SortConfig;
  onSort: (config: SortConfig) => void;
  onCitationClick: (citation: Citation, id: string) => void;
  onRetry: (docId: string, columnId: string) => void;
  onSaveColumn: (column: MatrixColumnConfig) => void;
  onRequestDeleteCol: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onAddQuery: (text: string) => void;
  onAddTemplate: (label: string, prompt?: string, format?: ColumnFormat, tags?: string[]) => void;
  onOpenViewer: (doc: DocumentMetadata) => void;
  onRequestDeleteDoc?: (doc: DocumentMetadata) => void;
  deletingDocId: string | null;
  showDeleteDoc: boolean;
}

export default function DocMatrixTable({
  columns,
  documents,
  cells,
  loading,
  dealId,
  activeCitationId,
  getColWidth,
  resizingKey,
  onColResize,
  sortConfig,
  onSort,
  onCitationClick,
  onRetry,
  onSaveColumn,
  onRequestDeleteCol,
  onReorder,
  onAddQuery,
  onAddTemplate,
  onOpenViewer,
  onRequestDeleteDoc,
  deletingDocId,
  showDeleteDoc,
}: DocMatrixTableProps) {
  const queries = columns.map((column) => column.id);

  const [newQuery, setNewQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  const templateRef = useRef<HTMLDivElement>(null);
  const templateBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Document-column sort menu
  const [openMenu, setOpenMenu] = useState<"doc" | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleAddQuery = () => {
    if (newQuery.trim()) {
      onAddQuery(newQuery.trim());
      setNewQuery("");
    }
  };

  const handleTemplateSelect = (
    label: string,
    prompt?: string,
    format?: ColumnFormat,
    tags?: string[]
  ) => {
    onAddTemplate(label, prompt, format, tags);
    setShowTemplates(false);
  };

  const handleColDragStart = (index: number) => setDragColIndex(index);
  const handleColDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverColIndex(index);
  };
  const handleColDrop = (index: number) => {
    if (dragColIndex !== null) onReorder(dragColIndex, index);
    setDragColIndex(null);
    setDragOverColIndex(null);
  };
  const handleColDragEnd = () => {
    setDragColIndex(null);
    setDragOverColIndex(null);
  };

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

  const tableMinWidth =
    getColWidth("doc", COL_DOC) +
    queries.reduce((sum, q) => sum + getColWidth(q, COL_QUERY), 0) +
    COL_ADD;
  const tableWidth = queries.length === 0 ? "100%" : `max(100%, ${tableMinWidth}px)`;

  return (
    <>
      <div className="min-h-[360px] overflow-auto rounded-lg shadow dark:shadow-gray-900/50 bg-white dark:bg-gray-900 max-h-[calc(100vh-220px)]">
        <table
          className="border-separate border-spacing-0"
          style={{
            tableLayout: "fixed",
            width: tableWidth,
          }}
        >
          <colgroup>
            <col style={{ width: getColWidth("doc", COL_DOC) }} />
            {queries.map((q) => (
              <col key={q} style={{ width: getColWidth(q, COL_QUERY) }} />
            ))}
            <col />
          </colgroup>
          <thead>
            <tr>
              {/* Document column header with Excel-like dropdown — sticky top + left (corner) */}
              <th
                className={`p-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-r border-b border-gray-300 dark:border-gray-700 sticky top-0 left-0 z-30 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${sortConfig?.col === "doc" ? "bg-blue-50 dark:bg-blue-950/40" : "bg-gray-100 dark:bg-gray-800"}`}
                onClick={(e) => openColMenu(e.currentTarget)}
              >
                <DocColumnHeaderLabel label="Document" sortConfig={sortConfig} />
                <ColResizeHandle
                  active={resizingKey === "doc"}
                  onMouseDown={(e) => onColResize(e, "doc", getColWidth("doc", COL_DOC))}
                />
              </th>
              {/* Query column headers — sticky top */}
              {columns.map((column, i) => {
                const q = column.id;
                return (
                  <th
                    key={q}
                    draggable
                    onDragStart={() => handleColDragStart(i)}
                    onDragOver={(e) => handleColDragOver(e, i)}
                    onDrop={() => handleColDrop(i)}
                    onDragEnd={handleColDragEnd}
                    className={`p-3 text-left font-medium text-gray-700 dark:text-gray-300 border-r border-b border-gray-300 dark:border-gray-700 sticky top-0 z-20 group cursor-grab active:cursor-grabbing transition-colors ${
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
                            <span className="truncate text-[10px] font-normal text-gray-500 dark:text-gray-500">
                              {column.prompt}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <ColumnConfigPopover
                          column={column}
                          disabled={loading}
                          onSave={onSaveColumn}
                          onDelete={() => onRequestDeleteCol(i)}
                        />
                      </div>
                    </div>
                    <ColResizeHandle
                      active={resizingKey === q}
                      onMouseDown={(e) => onColResize(e, q, getColWidth(q, COL_QUERY))}
                    />
                  </th>
                );
              })}
              {/* Add query column — sticky top */}
              <th className="p-3 border-r border-b border-gray-300 dark:border-gray-700 sticky top-0 z-20 bg-gray-100 dark:bg-gray-800">
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
                          className="fixed w-96 bg-white dark:bg-gray-900 rounded-lg shadow-2xl border border-gray-300 dark:border-gray-700 z-[9999] max-h-[480px] overflow-y-auto"
                          style={{
                            top: dropdownPos.top,
                            left: dropdownPos.left,
                          }}
                        >
                          <div className="p-2.5 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              Column Templates
                            </span>
                          </div>
                          <div>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 flex items-center gap-1.5 sticky top-10 z-[2] border-b border-gray-300 dark:border-gray-700">
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
                                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">
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
                              <div className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 flex items-center gap-1.5 sticky top-10 z-[2] border-b border-gray-300 dark:border-gray-700">
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
            {documents.map((doc) => (
              <DocMatrixRow
                key={doc.doc_id}
                doc={doc}
                columns={columns}
                docCells={cells[doc.doc_id]}
                dealId={dealId}
                activeCitationId={activeCitationId}
                onCitationClick={onCitationClick}
                onRetry={onRetry}
                onOpenViewer={onOpenViewer}
                onRequestDeleteDoc={onRequestDeleteDoc}
                isDeleting={deletingDocId === doc.doc_id}
                showDeleteDoc={showDeleteDoc}
              />
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
              onSort(dir ? { col: "doc", dir } : null);
              setOpenMenu(null);
            }}
            onClear={() => {
              onSort(null);
              setOpenMenu(null);
            }}
          />,
          document.body
        )}
    </>
  );
}

// ── Row (memoized so a single cell's token stream doesn't re-render the table) ──

function DocMatrixRowImpl({
  doc,
  columns,
  docCells,
  dealId,
  activeCitationId,
  onCitationClick,
  onRetry,
  onOpenViewer,
  onRequestDeleteDoc,
  isDeleting,
  showDeleteDoc,
}: {
  doc: DocumentMetadata;
  columns: MatrixColumnConfig[];
  docCells: Record<string, DocResult> | undefined;
  dealId: string;
  activeCitationId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
  onRetry: (docId: string, columnId: string) => void;
  onOpenViewer: (doc: DocumentMetadata) => void;
  onRequestDeleteDoc?: (doc: DocumentMetadata) => void;
  isDeleting: boolean;
  showDeleteDoc: boolean;
}) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Document name cell (sticky left) */}
      <td className="p-3 font-medium border-r border-b border-gray-300 dark:border-gray-700 sticky left-0 z-10 bg-white dark:bg-gray-900">
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
              onClick={() => onOpenViewer(doc)}
              className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block max-w-full text-left"
              title={doc.filename}
            >
              {doc.filename}
            </button>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-500">
              <span>{doc.page_count} pg</span>
            </div>
          </div>
          {showDeleteDoc && (
            <button
              type="button"
              title={`Delete ${doc.filename}`}
              aria-label={`Delete ${doc.filename}`}
              disabled={isDeleting}
              onClick={(event) => {
                event.stopPropagation();
                onRequestDeleteDoc?.(doc);
              }}
              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 hover:border-red-200 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              {isDeleting ? (
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
      {columns.map((column) => (
        <DocMatrixCell
          key={column.id}
          cell={docCells?.[column.id]}
          column={column}
          dealId={dealId}
          activeCitationId={activeCitationId}
          onCitationClick={onCitationClick}
          onRetry={() => onRetry(doc.doc_id, column.id)}
        />
      ))}
      {/* Empty cell under add-query column */}
      <td className="border-r border-b border-gray-300 dark:border-gray-700" />
    </tr>
  );
}

const DocMatrixRow = memo(DocMatrixRowImpl);

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
        background: active ? "var(--accent)" : "transparent",
        transition: "background 120ms",
        zIndex: 5,
      }}
      className="hover:bg-[var(--accent-tint-border)]"
    />
  );
}

// ── Shared sub-components for Excel-like column headers ──

function DocColumnHeaderLabel({
  label,
  sortConfig,
}: {
  label: string;
  sortConfig: SortConfig;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {label}
        {sortConfig && (
          <span className="text-blue-500 text-xs">
            {sortConfig.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </div>
      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

const DocColumnSortMenu = forwardRef<
  HTMLDivElement,
  {
    pos: { top: number; left: number };
    sortConfig: SortConfig;
    onSort: (dir: "asc" | "desc" | null) => void;
    onClear: () => void;
  }
>(function DocColumnSortMenu({ pos, sortConfig, onSort, onClear }, ref) {
  const isSortedAsc = sortConfig?.dir === "asc";
  const isSortedDesc = sortConfig?.dir === "desc";

  return (
    <div
      ref={ref}
      className="fixed w-44 bg-white rounded-lg shadow-2xl border border-gray-300 z-[9999] overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div>
        <button
          onClick={() => onSort(isSortedAsc ? null : "asc")}
          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${isSortedAsc ? "text-blue-600 font-medium bg-blue-50" : "text-gray-700"}`}
        >
          <span className="text-sm">{"▲"}</span> Sort A to Z
        </button>
        <button
          onClick={() => onSort(isSortedDesc ? null : "desc")}
          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${isSortedDesc ? "text-blue-600 font-medium bg-blue-50" : "text-gray-700"}`}
        >
          <span className="text-sm">{"▼"}</span> Sort Z to A
        </button>
      </div>
      {(isSortedAsc || isSortedDesc) && (
        <div className="border-t border-gray-200 p-1 space-y-0.5">
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
