import { useState, useEffect, useMemo, useRef } from "react";
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
import Button from "@/components/ui/Button";
import DocMatrixPanel from "@/components/DocMatrixPanel";
import DocumentViewer from "@/components/DocumentViewer";
import CitationPanel from "@/components/dd/CitationPanel";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const selectedUploadInputRef = useRef<HTMLInputElement>(null);

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
  const selectedUploadProgress = selectedDealId
    ? uploadProgressByDeal[selectedDealId]
    : undefined;

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

  // Semantic tokens flip with the theme themselves — no isDark branching, and
  // no marketing-page tokens on an app surface (those stay with the landing page).
  const pageBg = "var(--bg)";
  const border = "var(--border)";
  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const text = "var(--text-1)";
  const muted = "var(--text-3)";

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
        onOpenPortfolio={() => navigate("/portfolio")}
        onLogout={handleLogout}
      />

      {(dealsError || documentsError) && (
        <div
          className="border-b px-4 py-3 text-sm font-medium sm:px-5"
          style={{
            background: "var(--danger-tint)",
            borderBottomColor: "var(--danger-tint-border)",
            color: "var(--danger)",
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
            onDeleteDeal={setConfirmDeleteDeal}
            onUpdateDeal={editDeal}
            uploading={dealsLoading}
            uploadProgressByDeal={uploadProgressByDeal}
            user={user}
          />
        </div>

        {mobileDealsOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="h-full w-[min(86vw,340px)] shadow-2xl">
              <HomeSidebar
                deals={deals}
                filteredDeals={filteredDeals}
                selectedDealId={selectedDealId}
                search={dealSearch}
                onSearch={setDealSearch}
                onSelectDeal={(deal) => setSelectedDealId(deal.deal_id)}
                onDeleteDeal={setConfirmDeleteDeal}
                onUpdateDeal={editDeal}
                uploading={dealsLoading}
                uploadProgressByDeal={uploadProgressByDeal}
                user={user}
                onClose={() => setMobileDealsOpen(false)}
              />
            </div>
            <button
              type="button"
              className="flex-1 bg-black/30"
              onClick={() => setMobileDealsOpen(false)}
              aria-label="Close deals drawer"
            />
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
                className="mb-3 rounded-lg border px-3 py-3 sm:px-4"
                style={{
                  background: surface,
                  borderColor: border,
                }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="font-mono-plex"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: muted,
                        marginBottom: 4,
                      }}
                    >
                      Matrix
                    </div>
                    {selectedDeal.entity_type === "fund" ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/deal/${selectedDeal.deal_id}`)}
                        aria-label={`Analyze ${selectedDeal.name}`}
                        title={`Open ${selectedDeal.name} in Analyze`}
                        style={{
                          maxWidth: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          padding: 0,
                          background: "transparent",
                          border: "none",
                          fontSize: 21,
                          fontWeight: 600,
                          color: text,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {selectedDeal.name}
                        </span>
                        <span aria-hidden="true" style={{ flexShrink: 0, color: muted }}>
                          →
                        </span>
                      </button>
                    ) : (
                      <div
                        style={{
                          fontSize: 21,
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
                    )}
                    <div style={{ marginTop: 3, fontSize: 13, color: muted }}>
                      {documentsLoading
                        ? "Loading documents"
                        : `${documents.length} document${documents.length !== 1 ? "s" : ""}`}
                      {" · "}
                      <span className="font-mono-plex" style={{ marginLeft: 8, fontSize: 11 }}>
                        {selectedDeal.deal_id}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="lg:hidden">
                      <Button variant="secondary" size="sm" onClick={() => setMobileDealsOpen(true)}>
                        Switch deal
                      </Button>
                    </div>

                    {user?.is_admin && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => selectedUploadInputRef.current?.click()}
                        >
                          Upload
                        </Button>
                        <input
                          ref={selectedUploadInputRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (selectedDealId && files.length > 0) {
                              handleUploadFiles(selectedDealId, files);
                            }
                            e.target.value = "";
                          }}
                          style={{ display: "none" }}
                        />
                      </>
                    )}

                    {agenticEnabled && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate(`/deal/${selectedDeal.deal_id}`)}
                      >
                        Analyze
                      </Button>
                    )}
                  </div>
                </div>
                {selectedUploadProgress && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span
                        className="font-mono-plex"
                        style={{
                          color:
                            selectedUploadProgress.status === "error"
                              ? "var(--danger)"
                              : muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={
                          selectedUploadProgress.detail ||
                          selectedUploadProgress.filename ||
                          ""
                        }
                      >
                        {selectedUploadProgress.stage || "Indexing"}
                      </span>
                      <span style={{ color: text, fontWeight: 600 }}>
                        {selectedUploadProgress.percent}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={selectedUploadProgress.percent}
                      style={{
                        height: 6,
                        overflow: "hidden",
                        borderRadius: 999,
                        background: surfaceAlt,
                        border: `1px solid ${border}`,
                      }}
                    >
                      <div
                        style={{
                          width: `${selectedUploadProgress.percent}%`,
                          height: "100%",
                          background:
                            selectedUploadProgress.status === "error"
                              ? "var(--danger)"
                              : "var(--accent)",
                          transition: "width .25s ease",
                        }}
                      />
                    </div>
                  </div>
                )}
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
