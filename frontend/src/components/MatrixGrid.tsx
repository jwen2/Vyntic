"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { CellData, Citation, SYNTHESIS_DEAL_ID } from "@/lib/api";
import MatrixCell from "./MatrixCell";
import DocumentViewer from "./DocumentViewer";
import { QUERY_TEMPLATES } from "@/lib/queryTemplates";

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

  // Close template dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    };
    if (showTemplates) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
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
      <div className="text-center py-20 text-gray-400">
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
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>
          {selectedCount === deals.length
            ? "All deals selected"
            : `${selectedCount} of ${deals.length} deal${deals.length !== 1 ? "s" : ""} selected`}
          {selectedCount < deals.length && (
            <button
              onClick={onSelectAll}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              Select all
            </button>
          )}
        </span>
        <div className="flex items-center gap-3">
          {queries.length > 0 && onExport && (
            <button
              onClick={onExport}
              className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
              title="Export matrix as CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}
          <span className="text-gray-300">
            Click row to select · Ctrl+click to add · Shift+click for range
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow select-none">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-3 text-left font-semibold text-gray-700 border border-gray-200 min-w-[180px] sticky left-0 bg-gray-100 z-10">
                Deal
              </th>
              {queries.map((q, i) => (
                <th
                  key={i}
                  className="p-3 text-left font-medium text-gray-700 border border-gray-200 min-w-[250px] max-w-[350px]"
                >
                  <div className="text-sm">{q}</div>
                </th>
              ))}
              <th className="p-3 border border-gray-200 min-w-[320px]">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddQuery()}
                    placeholder="Ask away..."
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
                  <div className="relative" ref={templateRef}>
                    <button
                      onClick={() => setShowTemplates(!showTemplates)}
                      disabled={loading}
                      className="px-2 py-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                      title="Question templates"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                      </svg>
                    </button>

                    {/* Template dropdown */}
                    {showTemplates && (
                      <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[420px] overflow-y-auto">
                        <div className="p-2 border-b border-gray-100">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Question Templates
                          </span>
                        </div>
                        {QUERY_TEMPLATES.map((cat) => (
                          <div key={cat.name}>
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 flex items-center gap-1.5">
                              <span>{cat.icon}</span>
                              {cat.name}
                            </div>
                            {cat.templates.map((t) => (
                              <button
                                key={t.label}
                                onClick={() => handleTemplateSelect(t.query)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                              >
                                <div className="text-sm font-medium text-gray-800">
                                  {t.label}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                  {t.query}
                                </div>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
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
                  onClick={(e) => handleRowClick(dealId, e)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 hover:bg-blue-100/80"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <td
                    className={`p-3 font-medium border border-gray-200 sticky left-0 z-10 transition-colors ${
                      isSelected
                        ? "bg-blue-50 text-blue-900 border-l-2 border-l-blue-500"
                        : "bg-white text-gray-900"
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
                  <td className="border border-gray-200"></td>
                </tr>
              );
            })}

            {/* Synthesis row — shown when comparing multiple deals */}
            {queries.length > 0 && deals.length > 1 && cells[SYNTHESIS_DEAL_ID] && (
              <tr className="bg-amber-50/70 border-t-2 border-amber-300">
                <td className="p-3 font-medium border border-gray-200 sticky left-0 z-10 bg-amber-50">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                    <span className="text-sm font-bold text-amber-900">Synthesis</span>
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
                <td className="border border-gray-200 bg-amber-50"></td>
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
    </div>
  );
}
