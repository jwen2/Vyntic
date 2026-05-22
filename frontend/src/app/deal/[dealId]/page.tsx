"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Deal,
  Citation,
  ConversationEntry,
  listDeals,
  listConversations,
  listDocuments,
  DocumentMetadata,
  getMe,
  getAuthToken,
} from "@/lib/api";
import DocumentViewer from "@/components/DocumentViewer";
import { useTheme } from "@/components/ThemeProvider";

import TopBar, { DealWorkspaceMode } from "@/components/dd/TopBar";
import LeftSidebar from "@/components/dd/LeftSidebar";
import DealAssistantPanel from "@/components/assistant/DealAssistantPanel";
import WorkflowsView from "@/components/workflows/WorkflowsView";
import DealBriefDashboard from "@/components/dd/DealBriefDashboard";
import DocumentsModal from "@/components/dd/DocumentsModal";
import { useFindings } from "@/components/dd/useFindings";
import { ddTheme } from "@/components/dd/types";

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
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;
  const { theme, toggleTheme } = useTheme();
  const c = ddTheme(theme);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<DealWorkspaceMode>("agent");
  const [assistantHistory, setAssistantHistory] = useState<ConversationEntry[]>([]);
  const [assistantHistoryLoaded, setAssistantHistoryLoaded] = useState(false);
  const [selectedAssistantEntryId, setSelectedAssistantEntryId] = useState<string | null>(null);
  const [assistantNewChatSignal, setAssistantNewChatSignal] = useState(0);
  const [activeCit, setActiveCit] = useState<{ c: Citation; id: string } | null>(null);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
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

  useEffect(() => {
    setMode(loadModeFromLocal(dealId));
  }, [dealId]);

  useEffect(() => {
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

  const fetchDeal = useCallback(async () => {
    try {
      const deals = await listDeals();
      const found = deals.find((d) => d.deal_id === dealId);
      if (found) setDeal(found);
    } catch (err) {
      console.error("Failed to fetch deal:", err);
    }
  }, [dealId]);

  const fetchDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments(dealId);
      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
  }, [dealId]);

  const fetchAssistantHistory = useCallback(async () => {
    try {
      const items = await listConversations(dealId, "assistant");
      setAssistantHistory(items);
      setAssistantHistoryLoaded(true);
    } catch {
      setAssistantHistory([]);
      setAssistantHistoryLoaded(true);
    }
  }, [dealId]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }
    Promise.all([
      fetchDeal(),
      fetchDocuments(),
      fetchAssistantHistory(),
      getMe().catch(() => router.push("/login")),
    ]).finally(() => setLoading(false));
  }, [fetchAssistantHistory, fetchDeal, fetchDocuments, router]);

  const dealBreakers = findings.filter((f) => f.sev === "deal-breaker").length;

  useEffect(() => {
    setAssistantHistoryLoaded(false);
    setSelectedAssistantEntryId(null);
  }, [dealId]);

  const handleMode = useCallback((nextMode: DealWorkspaceMode) => {
    setMode(nextMode);
    setActiveCit(null);
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
    setAssistantHistory((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
    void fetchAssistantHistory();
  }, [fetchAssistantHistory]);

  // The Agent tab still exposes a "Run Proactive Scan" CTA on its empty state.
  // It now jumps to the Workflows tab (the new home of the Proactive Scan
  // built-in template). Future polish could auto-kick-off a run.
  const handleProactiveScan = useCallback(() => {
    setMode("workflows");
    setActiveCit(null);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="dd-spin" style={{ width: 32, height: 32, border: `4px solid ${c.border}`, borderTopColor: "#2563eb", borderRadius: "50%" }} />
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, color: c.t1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Deal not found</h2>
          <p style={{ fontSize: 13, color: c.t2, marginBottom: 16 }}>No deal with ID &quot;{dealId}&quot; exists.</p>
          <button onClick={() => router.push("/")} style={{ padding: "8px 14px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
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
        onBack={() => router.push("/")}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {mode === "agent" && (
          <LeftSidebar
            assistantHistory={assistantHistory}
            assistantHistoryLoaded={assistantHistoryLoaded}
            activeAssistantEntryId={selectedAssistantEntryId}
            theme={theme}
            onNewAssistantChat={handleNewAssistantChat}
            onSelectAssistantHistory={handleSelectAssistantHistory}
          />
        )}

        <main style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0, background: c.bg }}>
          {mode === "workflows" ? (
            <WorkflowsView dealId={dealId} theme={theme} />
          ) : mode === "brief" ? (
            <div style={{ flex: 1, width: "100%", minWidth: 0, overflow: "auto" }}>
              <DealBriefDashboard
                dealId={dealId}
                theme={theme}
                onCit={handleCit}
                onFindingsExtracted={syncScanFindings}
              />
            </div>
          ) : (
            <div style={{ flex: 1, width: "100%", minWidth: 0, display: "flex", overflow: "hidden", borderRight: activeCit ? `1px solid ${c.border}` : "none" }}>
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
          onDocumentDeleted={(docId) => {
            setDocuments((prev) => prev.filter((d) => d.doc_id !== docId));
            // If the doc viewer was showing the deleted doc, close it.
            setViewerState((prev) =>
              prev && documents.find((d) => d.doc_id === docId)?.filename === prev.filename
                ? null
                : prev,
            );
            // Refresh deal-level metadata (document_count) on the side.
            void fetchDeal();
          }}
        />
      )}
    </div>
  );
}
