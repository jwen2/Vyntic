"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDeals } from "@/hooks/useDeals";
import { useMatrix } from "@/hooks/useMatrix";
import MatrixGrid from "@/components/MatrixGrid";
import AddDealDialog from "@/components/AddDealDialog";
import DealCard from "@/components/DealCard";
import { exportMatrixCSV } from "@/lib/exportMatrix";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Deal, User, getMe, getAuthToken, clearAuthToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => {
        clearAuthToken();
        router.push("/login");
      })
      .finally(() => setAuthLoading(false));
  }, [router]);

  const {
    deals,
    loading: dealsLoading,
    error: dealsError,
    addDeal,
    removeDeal,
    uploadDocs,
    editDeal,
    refresh: refreshDeals,
  } = useDeals();
  const matrix = useMatrix();
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState<Deal | null>(null);

  // Sync deal IDs to matrix when deals change
  useEffect(() => {
    matrix.setDeals(deals.map((d) => d.deal_id));
  }, [deals, matrix.setDeals]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div>
            <div className="flex items-center gap-3">
              <img src="/temp_logo.jpg" alt="Vyntic" className="h-8 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Vyntic</h1>
                <p className="text-sm text-gray-500">AI Due Diligence Platform</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-xs text-gray-500 border-r border-gray-200 pr-3 mr-1">
                <span>{user.email}</span>
                {user.is_admin && (
                  <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                    Admin
                  </span>
                )}
                <button
                  onClick={() => {
                    clearAuthToken();
                    router.push("/login");
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Sign out"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            )}
            <span className="text-xs text-gray-400">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} active
            </span>
            {user?.is_admin && (
              <button
                onClick={() => setShowAddDeal(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add Deal
              </button>
            )}
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
                    <DealCard
                      key={deal.deal_id}
                      deal={deal}
                      expanded={expandedDealId === deal.deal_id}
                      onToggleExpand={() =>
                        setExpandedDealId(
                          expandedDealId === deal.deal_id
                            ? null
                            : deal.deal_id
                        )
                      }
                      onDelete={() => setConfirmDeleteDeal(deal)}
                      onUploadFiles={uploadDocs}
                      onUpdateDeal={editDeal}
                      onDocumentDeleted={refreshDeals}
                      uploading={dealsLoading}
                      readOnly={!user?.is_admin}
                    />
                  ))}
                </ul>
              )}
            </div>

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
              onExport={() =>
                exportMatrixCSV(
                  matrix.deals,
                  matrix.queries,
                  matrix.cells
                )
              }
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

      {/* Confirm Delete Deal Dialog */}
      {confirmDeleteDeal && (
        <ConfirmDialog
          title="Delete Deal"
          message={`Remove "${confirmDeleteDeal.name}" and all its documents and indexed data? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            removeDeal(confirmDeleteDeal.deal_id);
            setConfirmDeleteDeal(null);
          }}
          onCancel={() => setConfirmDeleteDeal(null)}
        />
      )}
    </div>
  );
}
