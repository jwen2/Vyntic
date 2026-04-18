"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDeals } from "@/hooks/useDeals";
import { useMatrix } from "@/hooks/useMatrix";
import MatrixGrid from "@/components/MatrixGrid";
import AddDealDialog from "@/components/AddDealDialog";
import DealCard from "@/components/DealCard";
import InvestigationPanel from "@/components/InvestigationPanel";
import { exportMatrixCSV } from "@/lib/exportMatrix";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Deal, User, getMe, getAuthToken, clearAuthToken } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

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
  const [dealSearch, setDealSearch] = useState("");
  const [investigation, setInvestigation] = useState<
    { dealId: string; goal: string } | null
  >(null);
  const agenticEnabled = process.env.NEXT_PUBLIC_AGENTIC === "1";
  const { theme, toggleTheme } = useTheme();

  // Filter deals by search term
  const filteredDeals = useMemo(() => {
    if (!dealSearch.trim()) return deals;
    const q = dealSearch.toLowerCase();
    return deals.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.deal_id.toLowerCase().includes(q)
    );
  }, [deals, dealSearch]);

  // Sync deal IDs to matrix when deals change
  useEffect(() => {
    matrix.setDeals(deals.map((d: Deal) => d.deal_id));
  }, [deals, matrix.setDeals]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  function handleLogout() {
    clearAuthToken();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div>
            <div className="flex items-center gap-3">
              <img src="/temp_logo.jpg" alt="Vyntic" className="h-8 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Vyntic</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">AI Due Diligence Platform</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 pr-3 mr-1">
                <span>{user.full_name || user.email}</span>
                {user.is_admin && (
                  <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 font-medium">
                    Admin
                  </span>
                )}
              </div>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} active
            </span>
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>
            {user?.is_admin && (
              <button
                onClick={() => setShowAddDeal(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add Deal
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Error display */}
        {(dealsError || matrix.error) && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {dealsError || matrix.error}
          </div>
        )}

        <div className="flex gap-6">
          {/* Left sidebar: Deal management */}
          <div className="w-72 flex-shrink-0 space-y-4">
            {/* Deal list */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Active Deals
              </h3>
              {/* Search input */}
              <div className="relative mb-3">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={dealSearch}
                  onChange={(e) => setDealSearch(e.target.value)}
                  placeholder="Search deals..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                {dealSearch && (
                  <button
                    onClick={() => setDealSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {filteredDeals.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {dealSearch ? "No matching deals" : "No deals yet"}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredDeals.map((deal) => (
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
                      onInvestigate={
                        agenticEnabled
                          ? (dealId) => setInvestigation({ dealId, goal: "" })
                          : undefined
                      }
                      uploading={dealsLoading}
                      readOnly={!user?.is_admin}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Architecture info */}
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                How it works
              </h3>
              <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
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
              onRemoveQuery={matrix.removeQuery}
              onRenameQuery={matrix.renameQuery}
              onReorderQueries={matrix.reorderQueries}
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
              onInvestigateCell={
                agenticEnabled
                  ? (dealId, query) => setInvestigation({ dealId, goal: query })
                  : undefined
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

      {/* Investigation Panel (agentic beta) */}
      {agenticEnabled && (
        <InvestigationPanel
          open={investigation !== null}
          dealId={investigation?.dealId ?? null}
          dealName={
            investigation
              ? deals.find((d) => d.deal_id === investigation.dealId)?.name
              : undefined
          }
          initialGoal={investigation?.goal}
          onClose={() => setInvestigation(null)}
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
