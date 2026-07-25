import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Citation,
  ConversationEntry,
  DocumentMetadata,
  getDeal,
  listConversations,
  listDocuments,
} from "@/lib/api";
import DocumentViewer from "@/components/DocumentViewer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useTheme } from "@/components/ThemeProvider";

import TopBar, { DealWorkspaceMode } from "@/components/dd/TopBar";
import LeftSidebar from "@/components/dd/LeftSidebar";
import DealAssistantPanel from "@/components/assistant/DealAssistantPanel";
import WorkflowsView from "@/components/workflows/WorkflowsView";
import DealBriefDashboard from "@/components/dd/DealBriefDashboard";
import DocumentsModal from "@/components/dd/DocumentsModal";
import PositionModal from "@/components/dd/PositionModal";
import MonitoringPanel from "@/components/dd/MonitoringPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useFindings } from "@/components/dd/useFindings";
import { ACCENT, ddTheme } from "@/components/dd/types";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";

const TAB_PREFIX = "vyntic_ws_tab_";

function loadModeFromLocal(dealId: string): DealWorkspaceMode {
  if (typeof window === "undefined") return "agent";
  try {
    const raw = localStorage.getItem(TAB_PREFIX + dealId);
    if (!raw) return "agent";
    const parsed = JSON.parse(raw) as { mode?: string };
    // Migrate legacy modes to current ones:
    //   "assistant" → "agent" (rename, PR #75)
    //   "workstreams" → "brief" (Workstreams tab retired, PR #80 — Brief is its
    //     closest surviving sibling)
    if (parsed.mode === "assistant") return "agent";
    if (parsed.mode === "workstreams") return "brief";
    if (
      parsed.mode === "agent" ||
      parsed.mode === "workflows" ||
      parsed.mode === "brief" ||
      parsed.mode === "monitoring"
    ) {
      return parsed.mode;
    }
    return "agent";
  } catch {
    return "agent";
  }
}

function saveModeToLocal(dealId: string, mode: DealWorkspaceMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TAB_PREFIX + dealId, JSON.stringify({ mode }));
  } catch {}
}

export default function DealWorkspacePage() {
  const { dealId: dealIdParam } = useParams<{ dealId: string }>();
  // The route always provides :dealId; the empty-string fallback keeps hook
  // order stable when it's absent — the guard below (after all hooks) renders
  // nothing in that case, and effects early-exit so no I/O happens.
  const dealId = dealIdParam ?? "";
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const c = ddTheme(theme);

  const [mode, setMode] = useState<DealWorkspaceMode>("agent");
  const [selectedAssistantEntry, setSelectedAssistantEntry] = useState<ConversationEntry | null>(null);
  const [assistantHistoryOpenSignal, setAssistantHistoryOpenSignal] = useState(0);
  const [assistantNewChatSignal, setAssistantNewChatSignal] = useState(0);
  const [activeCit, setActiveCit] = useState<{ c: Citation; id: string } | null>(null);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const {
    uploadDocs,
    uploading: documentsUploading,
    uploadProgressByDeal,
    error: documentUploadError,
  } = useDocumentUpload();
  // useFindings persists scan-extracted findings to localStorage and drives
  // the deal-breaker pill in TopBar. New findings flow in from the Brief tab
  // via syncScanFindings whenever a Proactive Scan workflow run completes.
  const { findings, syncScanFindings } = useFindings(dealId);

  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);

  // Server state, cached per deal. ProtectedRoute plus the transport layer's
  // 401 event already cover the session check the old getMe() call did here.
  const dealQuery = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getDeal(dealId),
    enabled: !!dealId,
  });
  const documentsQuery = useQuery({
    queryKey: ["deal", dealId, "documents"],
    queryFn: () => listDocuments(dealId),
    enabled: !!dealId,
  });
  const conversationsQuery = useQuery({
    queryKey: ["deal", dealId, "conversations"],
    queryFn: () => listConversations(dealId, "assistant"),
    enabled: !!dealId,
  });

  const deal = dealQuery.data ?? null;
  const documents: DocumentMetadata[] = documentsQuery.data ?? [];
  const assistantHistory: ConversationEntry[] = conversationsQuery.data ?? [];
  const assistantHistoryLoaded = conversationsQuery.isFetched;

  useEffect(() => {
    if (!dealId) return;
    setMode(loadModeFromLocal(dealId));
  }, [dealId]);

  useEffect(() => {
    if (!dealId) return;
    saveModeToLocal(dealId, mode);
  }, [dealId, mode]);

  const handleViewDocument = useCallback((citation: Citation) => {
    setViewerState({
      dealId,
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
  }, [dealId]);

  const handleCit = useCallback((citation: Citation, id: string) => {
    // A cited-source click opens the document viewer directly — the hover popover
    // already gives the snippet peek, so the click escalates to verification.
    // activeCit is kept only as a lightweight "last-opened" highlight on the badge.
    setActiveCit({ c: citation, id });
    handleViewDocument(citation);
  }, [handleViewDocument]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode("agent");
        return;
      }
      if (e.key === "Escape") {
        if (activeCit) setActiveCit(null);
        else if (viewerState) setViewerState(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeCit, viewerState]);

  const dealBreakers = findings.filter((f) => f.sev === "deal-breaker").length;

  useEffect(() => {
    setSelectedAssistantEntry(null);
    setMobileSidebarOpen(false);
  }, [dealId]);

  const handleMode = useCallback((nextMode: DealWorkspaceMode) => {
    setMode(nextMode);
    setActiveCit(null);
    setMobileSidebarOpen(false);
  }, []);

  const handleNewAssistantChat = useCallback(() => {
    setMode("agent");
    setActiveCit(null);
    setSelectedAssistantEntry(null);
    setAssistantNewChatSignal((signal) => signal + 1);
  }, []);

  const handleSelectAssistantHistory = useCallback((entry: ConversationEntry) => {
    setMode("agent");
    setActiveCit(null);
    setSelectedAssistantEntry(entry);
    setAssistantHistoryOpenSignal((signal) => signal + 1);
  }, []);

  const handleAssistantConversationSaved = useCallback((entry: ConversationEntry) => {
    // A completed response is still part of the live thread. Clear the
    // history-row highlight without sending a new history-open command to the
    // Agent panel, which would otherwise replace the thread with one Q&A pair.
    setSelectedAssistantEntry(null);
    // Optimistically prepend to the cache, then let the server confirm.
    queryClient.setQueryData<ConversationEntry[]>(
      ["deal", dealId, "conversations"],
      (prev) => [entry, ...(prev ?? []).filter((item) => item.id !== entry.id)]
    );
    void queryClient.invalidateQueries({ queryKey: ["deal", dealId, "conversations"] });
  }, [dealId, queryClient]);

  // The Agent tab exposes a deep-scan CTA on its empty state. Funds jump to the
  // Brief tab (home of the LP Fund Brief); deals jump to Workflows (home of the
  // buyout Proactive Scan template).
  const handleProactiveScan = useCallback(() => {
    setMode(deal?.entity_type === "fund" ? "brief" : "workflows");
    setActiveCit(null);
  }, [deal?.entity_type]);

  if (!dealIdParam) return null;

  if (dealQuery.isPending) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="dd-spin" style={{ width: 32, height: 32, border: `4px solid ${c.border}`, borderTopColor: ACCENT, borderRadius: "50%" }} />
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, color: c.t1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Deal not found</h2>
          <p style={{ fontSize: 13, color: c.t2, marginBottom: 16 }}>
            {dealQuery.error instanceof Error
              ? dealQuery.error.message
              : `No deal with ID "${dealId}" exists.`}
          </p>
          <button onClick={() => navigate("/app")} style={{ padding: "8px 14px", background: ACCENT, color: "var(--on-accent)", border: "none", borderRadius: 999, cursor: "pointer" }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const rail = (onClose?: () => void) => (
    <LeftSidebar
      deal={deal}
      mode={mode}
      onMode={onClose ? (m) => { handleMode(m); onClose(); } : handleMode}
      onOpenDocuments={() => { setDocumentsModalOpen(true); onClose?.(); }}
      onBack={() => navigate("/app")}
      assistantHistory={assistantHistory}
      assistantHistoryLoaded={assistantHistoryLoaded}
      activeAssistantEntryId={selectedAssistantEntry?.id ?? null}
      theme={theme}
      onNewAssistantChat={() => { handleNewAssistantChat(); onClose?.(); }}
      onSelectAssistantHistory={(entry) => { handleSelectAssistantHistory(entry); onClose?.(); }}
      onClose={onClose}
    />
  );

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
        background: c.bg,
        color: c.t1,
      }}
    >
      <div className="hidden lg:block">{rail()}</div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full w-[min(88vw,300px)] shadow-2xl">
            {rail(() => setMobileSidebarOpen(false))}
          </div>
          <button
            type="button"
            className="flex-1 bg-black/35"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close menu"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          deal={deal}
          dealBreakers={dealBreakers}
          onOpenPosition={deal.entity_type === "fund" ? () => setPositionModalOpen(true) : undefined}
          onOpenManager={deal.manager_id ? () => navigate(`/manager/${encodeURIComponent(deal.manager_id!)}`) : undefined}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onToggleTheme={toggleTheme}
          theme={theme}
        />

      {(documentsQuery.error || conversationsQuery.error) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            fontSize: 12,
            color: "var(--danger)",
            background: "var(--danger-tint)",
            borderBottom: `1px solid var(--danger-tint-border)`,
          }}
        >
          <span>
            {documentsQuery.error
              ? "Couldn’t load documents"
              : "Couldn’t load chat history"}
            {" — "}
            {(documentsQuery.error ?? conversationsQuery.error) instanceof Error
              ? ((documentsQuery.error ?? conversationsQuery.error) as Error).message
              : "request failed"}
          </span>
          <button
            type="button"
            onClick={() => {
              if (documentsQuery.error) void documentsQuery.refetch();
              if (conversationsQuery.error) void conversationsQuery.refetch();
            }}
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              border: `1px solid var(--danger-tint-border)`,
              background: "transparent",
              color: "inherit",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 overflow-hidden" style={{ background: c.bg }}>
          {mode === "workflows" ? (
            <ErrorBoundary>
              <WorkflowsView dealId={dealId} theme={theme} />
            </ErrorBoundary>
          ) : mode === "brief" ? (
            <div style={{ flex: 1, width: "100%", minWidth: 0, overflow: "auto" }}>
              <ErrorBoundary>
                <DealBriefDashboard
                  dealId={dealId}
                  theme={theme}
                  entityType={deal.entity_type}
                  onCit={handleCit}
                  onFindingsExtracted={syncScanFindings}
                />
              </ErrorBoundary>
            </div>
          ) : mode === "monitoring" ? (
            <div style={{ flex: 1, width: "100%", minWidth: 0, overflow: "auto" }}>
              <ErrorBoundary>
                <MonitoringPanel
                  dealId={dealId}
                  dealName={deal.name}
                  isAdmin={Boolean(user?.is_admin)}
                />
              </ErrorBoundary>
            </div>
          ) : (
            <div style={{ flex: 1, width: "100%", minWidth: 0, display: "flex", overflow: "hidden" }}>
              <ErrorBoundary>
                <DealAssistantPanel
                  deal={deal}
                  documents={documents}
                  selectedEntry={selectedAssistantEntry}
                  historyOpenSignal={assistantHistoryOpenSignal}
                  newChatSignal={assistantNewChatSignal}
                  activeCitId={activeCit?.id ?? null}
                  onCit={handleCit}
                  onOpenDocument={handleViewDocument}
                  onConversationSaved={handleAssistantConversationSaved}
                  onProactiveScan={handleProactiveScan}
                />
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>
      </div>

      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}

      {documentsModalOpen && (
        <DocumentsModal
          dealId={dealId}
          documents={documents}
          theme={theme}
          onClose={() => setDocumentsModalOpen(false)}
          onUploadDocuments={
            user?.is_admin ? (files) => uploadDocs(dealId, files) : undefined
          }
          uploading={documentsUploading}
          uploadProgress={uploadProgressByDeal[dealId]}
          uploadError={documentUploadError}
          onDocumentUpdated={(updated) => {
            queryClient.setQueryData<DocumentMetadata[]>(
              ["deal", dealId, "documents"],
              (prev) => (prev ?? []).map((d) => (d.doc_id === updated.doc_id ? updated : d))
            );
          }}
          onDocumentDeleted={(docId) => {
            // If the doc viewer was showing the deleted doc, close it.
            setViewerState((prev) =>
              prev && documents.find((d) => d.doc_id === docId)?.filename === prev.filename
                ? null
                : prev,
            );
            queryClient.setQueryData<DocumentMetadata[]>(
              ["deal", dealId, "documents"],
              (prev) => (prev ?? []).filter((d) => d.doc_id !== docId)
            );
            // Refresh deal-level metadata (document_count) on the side.
            void queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
            void queryClient.invalidateQueries({ queryKey: ["deals"] });
          }}
        />
      )}

      {positionModalOpen && deal.entity_type === "fund" && (
        <PositionModal
          dealId={dealId}
          dealName={deal.name}
          isAdmin={Boolean(user?.is_admin)}
          onClose={() => setPositionModalOpen(false)}
        />
      )}
    </div>
  );
}
