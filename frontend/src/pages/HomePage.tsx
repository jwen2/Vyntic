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
  const [mobileDealsOpen, setMobileDealsOpen] = useState(false);
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
  const pageBg = isDark ? "#0f0f0f" : "var(--landing-bg)";
  const border = isDark ? "#262626" : "var(--landing-border)";
  const surface = isDark ? "#151515" : "#ffffff";
  const surfaceAlt = isDark ? "#111111" : "#f8f8f4";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
  const muted = isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)";

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
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
        onOpenDeals={() => setMobileDealsOpen(true)}
        onLogout={handleLogout}
      />

      {(dealsError || documentsError) && (
        <div
          className="border-b px-4 py-3 text-sm font-medium sm:px-5"
          style={{
            background: isDark ? "#2a1212" : "#fff1f2",
            borderBottomColor: isDark ? "#4b1919" : "#f0c2bd",
            color: isDark ? "#fca5a5" : "#9a2e23",
            flexShrink: 0,
          }}
        >
          {dealsError || documentsError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
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
        </div>

        {mobileDealsOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <button
              type="button"
              className="flex-1 bg-black/30"
              onClick={() => setMobileDealsOpen(false)}
              aria-label="Close deals drawer"
            />
            <div className="h-full w-[min(86vw,340px)] shadow-2xl">
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
                onClose={() => setMobileDealsOpen(false)}
              />
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto"
          style={{
            background: pageBg,
            padding: "14px 12px 18px",
          }}
        >
          {selectedDeal ? (
            <div style={{ minHeight: "100%" }}>
              <div
                className="mb-4 rounded-[1.75rem] border p-4 sm:p-5"
                style={{
                  background: surface,
                  borderColor: border,
                }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="font-mono-plex"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: muted,
                        marginBottom: 8,
                      }}
                    >
                      Document matrix
                    </div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 600,
                        color: text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={selectedDeal.name}
                    >
                      {selectedDeal.name}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14, color: muted }}>
                      {documentsLoading
                        ? "Loading documents..."
                        : `${documents.length} document${documents.length !== 1 ? "s" : ""} loaded for review.`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="rounded-full border px-3 py-2"
                      style={{
                        borderColor: "var(--accent-tint-border)",
                        background: "var(--accent-tint)",
                      }}
                    >
                      <div
                        className="font-mono-plex"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: muted,
                        }}
                      >
                        Selected deal
                      </div>
                      <div style={{ marginTop: 3, fontSize: 13, fontWeight: 600, color: text }}>
                        {selectedDeal.deal_id}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-full border px-4 py-3 text-sm lg:hidden"
                      style={{
                        borderColor: border,
                        background: surfaceAlt,
                        color: text,
                      }}
                      onClick={() => setMobileDealsOpen(true)}
                    >
                      Switch deal
                    </button>

                    <div
                      className="hidden rounded-full border px-4 py-3 text-sm lg:block"
                      style={{
                        borderColor: border,
                        background: surfaceAlt,
                        color: muted,
                      }}
                    >
                      Select a deal on the left to swap matrices.
                    </div>
                  </div>
                </div>
              </div>

              {documentsLoading ? (
                <div
                  style={{
                    height: 280,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: muted,
                  }}
                >
                  <div
                    className="animate-spin"
                    style={{
                      width: 26,
                      height: 26,
                      border: `3px solid ${border}`,
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
                color: muted,
                fontSize: 14,
              }}
            >
              <div
                className="rounded-[1.75rem] border px-6 py-8 text-center"
                style={{
                  borderColor: border,
                  background: surface,
                }}
              >
                <div
                  className="font-mono-plex"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: muted,
                  }}
                >
                  No deal selected
                </div>
                <div style={{ marginTop: 12, fontSize: 20, fontWeight: 600, color: text }}>
                  Select or add a deal to start reviewing documents.
                </div>
              </div>
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
