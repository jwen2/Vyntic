import { forwardRef, memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentMetadata, Citation } from "@/lib/api";
import {
  getFormatShort,
  type MatrixColumnConfig,
} from "@/lib/matrixColumnConfig";
import DocMatrixCell from "./DocMatrixCell";
import Button from "@/components/ui/Button";
import ColumnConfigPopover from "./ColumnConfigPopover";
import type { DocResult, SortConfig } from "./useDocMatrix";

const COL_DOC = 240;
const COL_QUERY = 720;

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
  // Neutral chip with a restrained colour cue — the loud filled boxes made the
  // Document column noisy (red chip + red delete competing with the accent).
  const base = "bg-surface-alt border border-edge ";
  if (ext === "pdf") return base + "text-red-600 dark:text-red-300";
  if (ext === "xlsx" || ext === "xls") return base + "text-emerald-600 dark:text-emerald-300";
  if (ext === "csv") return base + "text-blue-600 dark:text-blue-300";
  return base + "text-t2";
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
  onOpenViewer,
  onRequestDeleteDoc,
  deletingDocId,
  showDeleteDoc,
}: DocMatrixTableProps) {
  const queries = columns.map((column) => column.id);

  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  // Document-column sort menu
  const [openMenu, setOpenMenu] = useState<"doc" | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

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

  const tableMinWidth =
    getColWidth("doc", COL_DOC) +
    queries.reduce((sum, q) => sum + getColWidth(q, COL_QUERY), 0);
  const tableWidth = queries.length === 0 ? "100%" : `max(100%, ${tableMinWidth}px)`;

  return (
    <>
      <div className="min-h-[360px] overflow-auto rounded-lg shadow dark:shadow-gray-900/50 bg-surface max-h-[calc(100vh-220px)]">
        <table
          className="border-separate border-spacing-0 text-[13px]"
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
                className={`p-3 text-left font-mono-dm text-[11px] font-normal text-t3 border-r border-edge border-b border-b-edge sticky top-0 left-0 z-30 cursor-pointer select-none hover:bg-surface-alt transition-colors shadow-[8px_0_16px_-12px_rgba(0,0,0,0.28)] ${sortConfig?.col === "doc" ? "bg-accent-tint" : "bg-grid-header"}`}
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
                    className={`p-3 text-left font-mono-dm text-[11px] font-normal text-t3 border-b border-b-edge sticky top-0 z-20 group cursor-grab active:cursor-grabbing transition-colors ${
                      dragColIndex === i ? "opacity-50" : ""
                    } ${
                      dragOverColIndex === i && dragColIndex !== i
                        ? "bg-accent-tint"
                        : "bg-grid-header"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="leading-snug flex-1 min-w-0">
                        <div className="truncate">{column.label}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-t3">
                            {getFormatShort(column.format)}
                          </span>
                          {column.prompt !== column.label && (
                            <span className="truncate text-[10px] font-normal text-t3">
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
              {/* Spacer column — the add-question composer now lives above the grid */}
              <th className="border-b border-b-edge sticky top-0 z-20 bg-grid-header" aria-hidden />
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
    <tr className="group transition-colors">
      {/* Document name cell (sticky left) */}
      <td className="p-3 font-medium border-r border-r-edge border-b border-b-edge-light sticky left-0 z-10 bg-surface transition-colors group-hover:bg-[var(--accent-tint)] shadow-[8px_0_16px_-12px_rgba(0,0,0,0.22)]">
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
              className="text-[13px] font-medium text-t1 hover:text-accent-strong transition-colors truncate block max-w-full text-left"
              title={doc.filename}
            >
              {doc.filename}
            </button>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-t3">
              <span>{doc.page_count} pg</span>
            </div>
          </div>
          {showDeleteDoc && (
            <Button
              variant="danger"
              size="sm"
              iconOnly
              loading={isDeleting}
              title={`Delete ${doc.filename}`}
              aria-label={`Delete ${doc.filename}`}
              onClick={(event) => {
                event.stopPropagation();
                onRequestDeleteDoc?.(doc);
              }}
              className={`shrink-0 ${isDeleting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v5" />
                <path d="M14 11v5" />
              </svg>
            </Button>
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
      <td className="border-b border-b-edge-light transition-colors group-hover:bg-[var(--accent-tint)]" />
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
          <span className="text-accent text-xs">
            {sortConfig.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </div>
      <svg className="w-3.5 h-3.5 text-t3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
      className="fixed w-44 bg-surface rounded-lg shadow-2xl border border-edge z-[9999] overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div>
        <button
          onClick={() => onSort(isSortedAsc ? null : "asc")}
          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-surface-alt transition-colors ${isSortedAsc ? "text-accent-strong font-medium bg-accent-tint" : "text-t2"}`}
        >
          <span className="text-sm">{"▲"}</span> Sort A to Z
        </button>
        <button
          onClick={() => onSort(isSortedDesc ? null : "desc")}
          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-surface-alt transition-colors ${isSortedDesc ? "text-accent-strong font-medium bg-accent-tint" : "text-t2"}`}
        >
          <span className="text-sm">{"▼"}</span> Sort Z to A
        </button>
      </div>
      {(isSortedAsc || isSortedDesc) && (
        <div className="border-t border-edge-light p-1 space-y-0.5">
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
