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
import { useAuth } from "@/contexts/AuthContext";
import { useFindings } from "@/components/dd/useFindings";
import { ACCENT, ddTheme } from "@/components/dd/types";

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
    if (parsed.mode === "agent" || parsed.mode === "workflows" || parsed.mode === "brief") {
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
  const isDark = theme === "dark";

  const [mode, setMode] = useState<DealWorkspaceMode>("agent");
  const [selectedAssistantEntryId, setSelectedAssistantEntryId] = useState<string | null>(null);
  const [assistantNewChatSignal, setAssistantNewChatSignal] = useState(0);
  const [activeCit, setActiveCit] = useState<{ c: Citation; id: string } | null>(null);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
    setActiveCit((prev) => (prev?.id === id ? null : { c: citation, id }));
  }, []);

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
    setSelectedAssistantEntryId(null);
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
    setSelectedAssistantEntryId(null);
    setAssistantNewChatSignal((signal) => signal + 1);
  }, []);

  const handleSelectAssistantHistory = useCallback((entry: ConversationEntry) => {
    setMode("agent");
    setActiveCit(null);
    setSelectedAssistantEntryId(entry.id);
  }, []);

  const handleAssistantConversationSaved = useCallback((entry: ConversationEntry) => {
    setSelectedAssistantEntryId(entry.id);
    // Optimistically prepend to the cache, then let the server confirm.
    queryClient.setQueryData<ConversationEntry[]>(
      ["deal", dealId, "conversations"],
      (prev) => [entry, ...(prev ?? []).filter((item) => item.id !== entry.id)]
    );
    void queryClient.invalidateQueries({ queryKey: ["deal", dealId, "conversations"] });
  }, [dealId, queryClient]);

  // The Agent tab still exposes a "Run Proactive Scan" CTA on its empty state.
  // It now jumps to the Workflows tab (the new home of the Proactive Scan
  // built-in template). Future polish could auto-kick-off a run.
  const handleProactiveScan = useCallback(() => {
    setMode("workflows");
    setActiveCit(null);
  }, []);

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

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
        background: c.bg,
        color: c.t1,
      }}
    >
      <TopBar
        deal={deal}
        mode={mode}
        onMode={handleMode}
        dealBreakers={dealBreakers}
        documentCount={documents.length}
        onOpenDocuments={() => setDocumentsModalOpen(true)}
        onOpenPosition={deal.entity_type === "fund" ? () => setPositionModalOpen(true) : undefined}
        onOpenManager={deal.manager_id ? () => navigate(`/manager/${encodeURIComponent(deal.manager_id!)}`) : undefined}
        onBack={() => navigate("/app")}
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
            color: isDark ? "#fca5a5" : "#9a2e23",
            background: isDark ? "#2a1212" : "#fff1f2",
            borderBottom: `1px solid ${isDark ? "#4b1919" : "#f0c2bd"}`,
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
              border: `1px solid ${isDark ? "#4b1919" : "#f0c2bd"}`,
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
        {mode === "agent" && (
          <div className="hidden lg:block">
            <LeftSidebar
              assistantHistory={assistantHistory}
              assistantHistoryLoaded={assistantHistoryLoaded}
              activeAssistantEntryId={selectedAssistantEntryId}
              theme={theme}
              onNewAssistantChat={handleNewAssistantChat}
              onSelectAssistantHistory={handleSelectAssistantHistory}
            />
          </div>
        )}

        {mode === "agent" && mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <button
              type="button"
              className="flex-1 bg-black/35"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close chat history"
            />
            <div className="h-full w-[min(88vw,340px)] shadow-2xl">
              <LeftSidebar
                assistantHistory={assistantHistory}
                assistantHistoryLoaded={assistantHistoryLoaded}
                activeAssistantEntryId={selectedAssistantEntryId}
                theme={theme}
                onNewAssistantChat={handleNewAssistantChat}
                onSelectAssistantHistory={(entry) => {
                  handleSelectAssistantHistory(entry);
                  setMobileSidebarOpen(false);
                }}
                onClose={() => setMobileSidebarOpen(false)}
              />
            </div>
          </div>
        )}

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
                  onCit={handleCit}
                  onFindingsExtracted={syncScanFindings}
                />
              </ErrorBoundary>
            </div>
          ) : (
            <div style={{ flex: 1, width: "100%", minWidth: 0, display: "flex", overflow: "hidden", borderRight: activeCit ? `1px solid ${c.border}` : "none" }}>
              <ErrorBoundary>
                <DealAssistantPanel
                  deal={deal}
                  documents={documents}
                  selectedEntry={assistantHistory.find((entry) => entry.id === selectedAssistantEntryId) || null}
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
          theme={theme}
          onClose={() => setPositionModalOpen(false)}
        />
      )}
    </div>
  );
}
