"use client";
import { useState } from "react";
import { CellData } from "@/lib/api";
import MatrixCell from "./MatrixCell";

interface Props {
  deals: string[];
  queries: string[];
  cells: Record<string, Record<string, CellData>>;
  onAddQuery: (query: string) => void;
  loading: boolean;
  selectedDeals: Set<string>;
  onSelectDeal: (dealId: string, opts: { ctrl?: boolean; shift?: boolean }) => void;
  onSelectAll: () => void;
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
}: Props) {
  const [newQuery, setNewQuery] = useState("");

  const handleAddQuery = () => {
    if (newQuery.trim()) {
      onAddQuery(newQuery.trim());
      setNewQuery("");
    }
  };

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
      {/* Selection hint */}
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
        <span className="text-gray-300">
          Click row to select · Ctrl+click to add · Shift+click for range
        </span>
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
              <th className="p-3 border border-gray-200 min-w-[280px]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddQuery()}
                    placeholder="Add a question column..."
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
                    <MatrixCell key={i} cell={cells[dealId]?.[q]} />
                  ))}
                  <td className="border border-gray-200"></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
