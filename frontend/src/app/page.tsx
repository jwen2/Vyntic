"use client";
import { useState, useEffect } from "react";
import { useDeals } from "@/hooks/useDeals";
import { useMatrix } from "@/hooks/useMatrix";
import MatrixGrid from "@/components/MatrixGrid";
import AddDealDialog from "@/components/AddDealDialog";
import UploadPanel from "@/components/UploadPanel";
import DealDetailPanel from "@/components/DealDetailPanel";

export default function Home() {
  const {
    deals,
    loading: dealsLoading,
    error: dealsError,
    addDeal,
    removeDeal,
    uploadDoc,
  } = useDeals();
  const matrix = useMatrix();
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);

  // Sync deal IDs to matrix when deals change
  useEffect(() => {
    matrix.setDeals(deals.map((d) => d.deal_id));
  }, [deals, matrix.setDeals]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div>
            <div className="flex items-center gap-3">
              <img src="/logo.jpg" alt="Vyntic" className="h-8 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Vyntic</h1>
                <p className="text-sm text-gray-500">AI Asset Analysis</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} active
            </span>
            <button
              onClick={() => setShowAddDeal(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Deal
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Error display */}
        {(dealsError || matrix.error) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {dealsError || matrix.error}
          </div>
        )}

        <div className="flex gap-6">
          {/* Left sidebar: Deal management */}
          <div className="w-72 flex-shrink-0 space-y-4">
            {/* Deal list */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Active Deals
              </h3>
              {deals.length === 0 ? (
                <p className="text-sm text-gray-400">No deals yet</p>
              ) : (
                <ul className="space-y-2">
                  {deals.map((deal) => (
                    <li
                      key={deal.deal_id}
                      className="p-2 bg-gray-50 rounded-md group"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="cursor-pointer flex-1 min-w-0"
                          onClick={() =>
                            setExpandedDealId(
                              expandedDealId === deal.deal_id
                                ? null
                                : deal.deal_id
                            )
                          }
                        >
                          <div className="text-sm font-medium text-gray-800">
                            {deal.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {deal.deal_id} · {deal.document_count} doc
                            {deal.document_count !== 1 ? "s" : ""}
                            <span className="ml-1 text-blue-400">
                              {expandedDealId === deal.deal_id ? "▾" : "▸"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeDeal(deal.deal_id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-sm ml-2"
                          title="Delete deal"
                        >
                          x
                        </button>
                      </div>
                      {expandedDealId === deal.deal_id && (
                        <DealDetailPanel deal={deal} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Upload */}
            <UploadPanel
              deals={deals}
              onUpload={uploadDoc}
              uploading={dealsLoading}
            />

            {/* Architecture info */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-2">
                How it works
              </h3>
              <ul className="text-xs text-blue-700 space-y-1.5">
                <li>Each deal is isolated in its own vector namespace</li>
                <li>Queries fan out to worker agents per deal</li>
                <li>A synthesis agent compares results</li>
                <li>Zero context leak between deals</li>
              </ul>
            </div>
          </div>

          {/* Main content: Matrix grid */}
          <div className="flex-1 min-w-0">
            <MatrixGrid
              deals={matrix.deals}
              queries={matrix.queries}
              cells={matrix.cells}
              onAddQuery={(query) =>
                matrix.addQuery(query, Array.from(matrix.selectedDeals))
              }
              loading={matrix.loading}
              selectedDeals={matrix.selectedDeals}
              onSelectDeal={matrix.selectDeal}
              onSelectAll={matrix.selectAllDeals}
            />
          </div>
        </div>
      </div>

      {/* Add Deal Dialog */}
      {showAddDeal && (
        <AddDealDialog
          onAdd={addDeal}
          onClose={() => setShowAddDeal(false)}
        />
      )}
    </div>
  );
}
