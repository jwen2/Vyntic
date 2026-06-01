import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDeals } from "@/hooks/useDeals";
import AddDealDialog from "@/components/AddDealDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Citation,
  Deal,
  DocumentMetadata,
  deleteDocument,
  listDocuments,
} from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import HomeTopBar from "@/components/home/HomeTopBar";
import HomeSidebar from "@/components/home/HomeSidebar";
import DocMatrixPanel from "@/components/DocMatrixPanel";
import DocumentViewer from "@/components/DocumentViewer";
import CitationPanel from "@/components/dd/CitationPanel";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const {
    deals,
    loading: dealsLoading,
    error: dealsError,
    addDeal,
    removeDeal,
    uploadDocs,
    uploadProgressByDeal,
    editDeal,
    refresh: refreshDeals,
  } = useDeals();
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [confirmDeleteDeal, setConfirmDeleteDeal] = useState<Deal | null>(null);
  const [dealSearch, setDealSearch] = useState("");
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);
  const [activeCitation, setActiveCitation] = useState<{
    citation: Citation;
    id: string;
  } | null>(null);
  const agenticEnabled = import.meta.env.VITE_AGENTIC !== "0";
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

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.deal_id === selectedDealId) ?? null,
    [deals, selectedDealId]
  );

  useEffect(() => {
    if (deals.length === 0) {
      setSelectedDealId(null);
      return;
    }
    if (!selectedDealId || !deals.some((deal) => deal.deal_id === selectedDealId)) {
      setSelectedDealId(deals[0].deal_id);
    }
  }, [deals, selectedDealId]);

  useEffect(() => {
    if (!selectedDealId) {
      setDocuments([]);
      setDocumentsError(null);
      setActiveCitation(null);
      return;
    }

    let cancelled = false;
    setDocumentsLoading(true);
    setDocumentsError(null);
    setActiveCitation(null);

    listDocuments(selectedDealId)
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .catch((err) => {
        if (!cancelled) {
          setDocuments([]);
          setDocumentsError(
            err instanceof Error ? err.message : "Failed to load documents"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDocumentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDealId]);

  function handleLogout() {
    logout();
  }

  async function handleUploadFiles(dealId: string, files: File[]) {
    await uploadDocs(dealId, files);
    if (dealId === selectedDealId) {
      try {
        const docs = await listDocuments(dealId);
        setDocuments(docs);
      } catch {}
    }
  }

  async function handleDeleteDocument(doc: DocumentMetadata) {
    if (!selectedDealId) return;
    await deleteDocument(selectedDealId, doc.doc_id);
    setDocuments((prev) => prev.filter((d) => d.doc_id !== doc.doc_id));
    setActiveCitation((prev) =>
      prev?.citation.source_file === doc.filename ? null : prev
    );
    setViewerState((prev) =>
      prev?.filename === doc.filename ? null : prev
    );
    try {
      const docs = await listDocuments(selectedDealId);
      setDocuments(docs);
    } catch {}
    await refreshDeals();
  }

  function handleViewDocument(citation: Citation) {
    setViewerState({
      dealId: selectedDealId ?? citation.deal_id ?? "",
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
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
        onAddDeal={user?.is_admin ? () => setShowAddDeal(true) : undefined}
        onLogout={handleLogout}
      />

      {(dealsError || documentsError) && (
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
          {dealsError || documentsError}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <HomeSidebar
          deals={deals}
          filteredDeals={filteredDeals}
          selectedDealId={selectedDealId}
          search={dealSearch}
          onSearch={setDealSearch}
          onSelectDeal={(deal) => setSelectedDealId(deal.deal_id)}
          onInvestigateDeal={
            agenticEnabled
              ? (deal) => navigate(`/deal/${deal.deal_id}`)
              : undefined
          }
          onDeleteDeal={setConfirmDeleteDeal}
          onUploadFiles={handleUploadFiles}
          onUpdateDeal={editDeal}
          uploading={dealsLoading}
          uploadProgressByDeal={uploadProgressByDeal}
          user={user}
        />

        <div
          className="flex-1 overflow-y-auto"
          style={{
            background: pageBg,
            padding: "14px 16px",
          }}
        >
          {selectedDeal ? (
            <div style={{ minHeight: "100%" }}>
              <div
                className="flex items-center justify-between gap-3"
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  background: isDark ? "#0f172a" : "#ffffff",
                  border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isDark ? "#64748b" : "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 2,
                    }}
                  >
                    Document Matrix
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isDark ? "#f8fafc" : "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={selectedDeal.name}
                  >
                    {selectedDeal.name}
                  </div>
                  <div style={{ fontSize: 12, color: isDark ? "#94a3b8" : "#64748b" }}>
                    {documentsLoading
                      ? "Loading documents..."
                      : `${documents.length} document${documents.length !== 1 ? "s" : ""}`}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: isDark ? "#64748b" : "#94a3b8",
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  Select a deal on the left to swap matrices.
                </div>
              </div>

              {documentsLoading ? (
                <div
                  style={{
                    height: 280,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isDark ? "#64748b" : "#94a3b8",
                  }}
                >
                  <div
                    className="animate-spin"
                    style={{
                      width: 26,
                      height: 26,
                      border: "3px solid #2563eb",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                    }}
                  />
                </div>
              ) : (
                <DocMatrixPanel
                  key={selectedDeal.deal_id}
                  dealId={selectedDeal.deal_id}
                  documents={documents}
                  onViewDocument={handleViewDocument}
                  onDeleteDocument={handleDeleteDocument}
                  activeCitationId={activeCitation?.id ?? null}
                  onInspectCitation={(citation, id) =>
                    setActiveCitation((prev) =>
                      prev?.id === id ? null : { citation, id }
                    )
                  }
                />
              )}
            </div>
          ) : (
            <div
              style={{
                minHeight: "60vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isDark ? "#64748b" : "#94a3b8",
                fontSize: 14,
              }}
            >
              Select or add a deal to start reviewing its documents.
            </div>
          )}
        </div>

        {activeCitation && (
          <CitationPanel
            citation={activeCitation.citation}
            onClose={() => setActiveCitation(null)}
            onOpenDocument={handleViewDocument}
          />
        )}
      </div>

      {showAddDeal && (
        <AddDealDialog onAdd={addDeal} onClose={() => setShowAddDeal(false)} />
      )}

      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
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
