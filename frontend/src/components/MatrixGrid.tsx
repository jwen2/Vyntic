"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { CellData, Citation, SYNTHESIS_DEAL_ID } from "@/lib/api";
import MatrixCell from "./MatrixCell";
import DocumentViewer from "./DocumentViewer";
import { QUERY_TEMPLATES } from "@/lib/queryTemplates";
import ConfirmDialog from "./ConfirmDialog";

interface ViewerState {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
}

interface Props {
  deals: string[];
  queries: string[];
  cells: Record<string, Record<string, CellData>>;
  onAddQuery: (query: string) => void;
  onRemoveQuery?: (index: number) => void;
  onRenameQuery?: (index: number, newName: string) => void;
  onReorderQueries?: (fromIndex: number, toIndex: number) => void;
  loading: boolean;
  selectedDeals: Set<string>;
  onSelectDeal: (dealId: string, opts: { ctrl?: boolean; shift?: boolean }) => void;
  onSelectAll: () => void;
  onExport?: () => void;
}

export default function MatrixGrid({
  deals,
  queries,
  cells,
  onAddQuery,
  onRemoveQuery,
  onRenameQuery,
  onReorderQueries,
  loading,
  selectedDeals,
  onSelectDeal,
  onSelectAll,
  onExport,
}: Props) {
  const [newQuery, setNewQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const templateBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Column management state
  const [editingColIndex, setEditingColIndex] = useState<number | null>(null);
  const [editingColValue, setEditingColValue] = useState("");
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);
  const [dragColIndex, setDragColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  const handleAddQuery = () => {
    if (newQuery.trim()) {
      onAddQuery(newQuery.trim());
      setNewQuery("");
    }
  };

  const handleTemplateSelect = (query: string) => {
    onAddQuery(query);
    setShowTemplates(false);
  };

  const handleCitationClick = useCallback((citation: Citation, dealId: string) => {
    setViewerState({
      dealId,
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet,
    });
  }, []);

  // Column rename handlers
  const startRename = (index: number) => {
    setEditingColIndex(index);
    setEditingColValue(queries[index]);
  };

  const commitRename = () => {
    if (editingColIndex !== null && onRenameQuery && editingColValue.trim()) {
      onRenameQuery(editingColIndex, editingColValue.trim());
    }
    setEditingColIndex(null);
    setEditingColValue("");
  };

  // Column drag-and-drop handlers
  const handleColDragStart = (index: number) => {
    setDragColIndex(index);
  };

  const handleColDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverColIndex(index);
  };

  const handleColDrop = (index: number) => {
    if (dragColIndex !== null && onReorderQueries) {
      onReorderQueries(dragColIndex, index);
    }
    setDragColIndex(null);
    setDragOverColIndex(null);
  };

  const handleColDragEnd = () => {
    setDragColIndex(null);
    setDragOverColIndex(null);
  };

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
        templateRef.current && !templateRef.current.contains(e.target as Node) &&
        templateBtnRef.current && !templateBtnRef.current.contains(e.target as Node)
      ) {
        setShowTemplates(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplates]);

  const handleRowClick = (dealId: string, e: React.MouseEvent) => {
    onSelectDeal(dealId, {
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
    });
  };

  const selectedCount = selectedDeals.size;

  if (deals.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 dark:text-gray-600">
        <div className="text-4xl mb-4">+</div>
        <div className="text-lg">Add deals to get started</div>
        <div className="text-sm mt-2">
          Create deals, upload documents, then ask questions across all deals
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selection hint + export */}
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 px-1">
        <span>
          {selectedCount === deals.length
            ? "All deals selected"
            : `${selectedCount} of ${deals.length} deal${deals.length !== 1 ? "s" : ""} selected`}
          {selectedCount < deals.length && (
            <button
              onClick={onSelectAll}
              className="ml-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Select all
            </button>
          )}
        </span>
        <div className="flex items-center gap-3">
          {queries.length > 0 && onExport && (
            <button
              onClick={onExport}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
              title="Export matrix as CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}
          <span className="text-gray-300 dark:text-gray-600">
            Click row to select · Ctrl+click to add · Shift+click for range
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-900/50">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 min-w-[180px] sticky left-0 bg-gray-100 dark:bg-gray-800 z-10">
                Deal
              </th>
              {queries.map((q, i) => (
                <th
                  key={i}
                  draggable={!!onReorderQueries}
                  onDragStart={() => handleColDragStart(i)}
                  onDragOver={(e) => handleColDragOver(e, i)}
                  onDrop={() => handleColDrop(i)}
                  onDragEnd={handleColDragEnd}
                  className={`p-3 text-left font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 min-w-[250px] max-w-[350px] group transition-colors ${
                    dragColIndex === i ? "opacity-50" : ""
                  } ${dragOverColIndex === i && dragColIndex !== i ? "bg-blue-50 dark:bg-blue-950/40" : ""} ${
                    onReorderQueries ? "cursor-grab active:cursor-grabbing" : ""
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
                        className="text-sm flex-1 min-w-0 cursor-text"
                        onDoubleClick={() => onRenameQuery && startRename(i)}
                        title="Double-click to rename"
                      >
                        {q}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {onRenameQuery && (
                          <button
                            onClick={() => startRename(i)}
                            className="p-0.5 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded"
                            title="Rename column"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                        )}
                        {onRemoveQuery && (
                          <button
                            onClick={() => setConfirmDeleteCol(i)}
                            className="p-0.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded"
                            title="Delete column"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </th>
              ))}
              <th className="p-3 border border-gray-200 dark:border-gray-700 min-w-[320px]">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddQuery()}
                    placeholder="Ask away..."
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
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                      </svg>
                    </button>

                    {/* Template dropdown — portaled to body so it never clips */}
                    {showTemplates &&
                      createPortal(
                        <div
                          ref={templateRef}
                          className="fixed w-96 bg-white dark:bg-gray-900 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-[9999] max-h-[480px] overflow-y-auto"
                          style={{ top: dropdownPos.top, left: dropdownPos.left }}
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
                                  onClick={() => handleTemplateSelect(t.query)}
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
            {deals.map((dealId) => {
              const isSelected = selectedDeals.has(dealId);
              return (
                <tr
                  key={dealId}
                  className={`transition-colors ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100/80 dark:hover:bg-blue-950/50"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <td
                    onClick={(e) => handleRowClick(dealId, e)}
                    className={`p-3 font-medium border border-gray-200 dark:border-gray-700 sticky left-0 z-10 transition-colors cursor-pointer select-none ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 border-l-2 border-l-blue-500"
                        : "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    <div className="text-sm font-semibold">{dealId}</div>
                  </td>
                  {queries.map((q, i) => (
                    <MatrixCell
                      key={i}
                      cell={cells[dealId]?.[q]}
                      dealId={dealId}
                      onCitationClick={handleCitationClick}
                    />
                  ))}
                  <td className="border border-gray-200 dark:border-gray-700"></td>
                </tr>
              );
            })}

            {/* Synthesis row — shown when comparing multiple deals */}
            {queries.length > 0 && deals.length > 1 && cells[SYNTHESIS_DEAL_ID] && (
              <tr className="bg-amber-50/70 dark:bg-amber-950/30 border-t-2 border-amber-300 dark:border-amber-700">
                <td className="p-3 font-medium border border-gray-200 dark:border-gray-700 sticky left-0 z-10 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                    <span className="text-sm font-bold text-amber-900 dark:text-amber-300">Synthesis</span>
                  </div>
                </td>
                {queries.map((q, i) => (
                  <MatrixCell
                    key={`synth-${i}`}
                    cell={cells[SYNTHESIS_DEAL_ID]?.[q]}
                    synthesis
                    onCitationClick={handleCitationClick}
                  />
                ))}
                <td className="border border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-950/30"></td>
              </tr>
            )}
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
      {confirmDeleteCol !== null && onRemoveQuery && (
        <ConfirmDialog
          title="Delete Column"
          message={`Remove the query "${queries[confirmDeleteCol]}" and all its results? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            onRemoveQuery(confirmDeleteCol);
            setConfirmDeleteCol(null);
          }}
          onCancel={() => setConfirmDeleteCol(null)}
        />
      )}
    </div>
  );
}
