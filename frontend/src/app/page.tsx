"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDeals } from "@/hooks/useDeals";
import { useMatrix } from "@/hooks/useMatrix";
import MatrixGrid from "@/components/MatrixGrid";
import AddDealDialog from "@/components/AddDealDialog";
import InvestigationPanel from "@/components/InvestigationPanel";
import { exportMatrixCSV } from "@/lib/exportMatrix";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Deal, User, getMe, getAuthToken, clearAuthToken } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import HomeTopBar from "@/components/home/HomeTopBar";
import HomeSidebar from "@/components/home/HomeSidebar";

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
  } = useDeals();
  const matrix = useMatrix();
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState<Deal | null>(null);
  const [dealSearch, setDealSearch] = useState("");
  const [investigation, setInvestigation] = useState<
    { dealId: string; goal: string } | null
  >(null);
  const agenticEnabled = process.env.NEXT_PUBLIC_AGENTIC === "1";
  const { theme, toggleTheme } = useTheme();

  const filteredDeals = useMemo(() => {
    if (!dealSearch.trim()) return deals;
    const q = dealSearch.toLowerCase();
    return deals.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.deal_id.toLowerCase().includes(q)
    );
  }, [deals, dealSearch]);

  const documentTotal = useMemo(
    () => deals.reduce((sum, d) => sum + d.document_count, 0),
    [deals]
  );

  useEffect(() => {
    matrix.setDeals(deals.map((d: Deal) => d.deal_id));
  }, [deals, matrix.setDeals]);

  if (authLoading || !user) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: theme === "dark" ? "#020617" : "#f8fafc",
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: 28,
            height: 28,
            border: "3px solid #2563eb",
            borderTopColor: "transparent",
            borderRadius: "50%",
          }}
        />
      </div>
    );
  }

  function handleLogout() {
    clearAuthToken();
    window.location.href = "/login";
  }

  const isDark = theme === "dark";
  const pageBg = isDark ? "#020617" : "#f8fafc";

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
        background: pageBg,
      }}
    >
      <HomeTopBar
        user={user}
        dealCount={deals.length}
        documentTotal={documentTotal}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAddDeal={user.is_admin ? () => setShowAddDeal(true) : undefined}
        onLogout={handleLogout}
      />

      {(dealsError || matrix.error) && (
        <div
          style={{
            background: "#fff1f2",
            borderBottom: "1px solid #fecdd3",
            padding: "7px 20px",
            fontSize: 13,
            color: "#991b1b",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {dealsError || matrix.error}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <HomeSidebar
          deals={deals}
          filteredDeals={filteredDeals}
          search={dealSearch}
          onSearch={setDealSearch}
          onDeleteDeal={setConfirmDeleteDeal}
          onUploadFiles={uploadDocs}
          onUpdateDeal={editDeal}
          uploading={dealsLoading}
          user={user}
        />

        <div
          className="flex-1 overflow-y-auto"
          style={{
            background: pageBg,
            padding: "16px 20px",
          }}
        >
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
              exportMatrixCSV(matrix.deals, matrix.queries, matrix.cells)
            }
            onInvestigateCell={
              agenticEnabled
                ? (dealId, query) => setInvestigation({ dealId, goal: query })
                : undefined
            }
          />
        </div>
      </div>

      {showAddDeal && (
        <AddDealDialog onAdd={addDeal} onClose={() => setShowAddDeal(false)} />
      )}

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
