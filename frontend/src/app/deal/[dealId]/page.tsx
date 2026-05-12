"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Deal,
  Citation,
  ConversationEntry,
  listDeals,
  listConversations,
  listDocuments,
  deleteDocument,
  DocumentMetadata,
  getMe,
  getAuthToken,
} from "@/lib/api";
import { DD_WORKSTREAMS, WorkstreamId } from "@/lib/queryTemplates";
import DocumentViewer from "@/components/DocumentViewer";
import ReportModal from "@/components/ReportModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useTheme } from "@/components/ThemeProvider";
import type { QuestionResult } from "@/components/WorkstreamPanel";

import TopBar, { DealWorkspaceMode } from "@/components/dd/TopBar";
import LeftSidebar from "@/components/dd/LeftSidebar";
import DDWorkstreamView from "@/components/dd/DDWorkstreamView";
import CitationPanel from "@/components/dd/CitationPanel";
import DealAssistantPanel from "@/components/assistant/DealAssistantPanel";
import WorkstreamListView from "@/components/dd/WorkstreamListView";
import DocumentDetailView from "@/components/dd/DocumentDetailView";
import ProactiveScanPanel from "@/components/ProactiveScanPanel";
import WorkflowsView from "@/components/workflows/WorkflowsView";
import { useFindings } from "@/components/dd/useFindings";
import { computeCoverage } from "@/components/dd/coverage";
import { extractScanFindings } from "@/components/dd/extractScanFindings";
import { ddTheme } from "@/components/dd/types";
import type { DocCoverage, Finding } from "@/components/dd/types";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;
type NavState = { mode: DealWorkspaceMode; selectedWorkstream: WorkstreamId | null };

const CACHE_PREFIX = "vyntic_ws_cache_";
const TAB_PREFIX = "vyntic_ws_tab_";
const DETAIL_WORKSTREAMS: WorkstreamId[] = ["financial", "commercial", "operational", "legal"];
const LINKABLE_WORKSTREAMS: WorkstreamId[] = [...DETAIL_WORKSTREAMS, "proactive_scan"];

function loadCacheFromLocal(dealId: string): WorkstreamCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + dealId);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveCacheToLocal(dealId: string, cache: WorkstreamCache) {
  if (typeof window === "undefined") return;
  try {
    const persistable: WorkstreamCache = {};
    for (const [wsId, questions] of Object.entries(cache)) {
      const filtered: Record<string, QuestionResult> = {};
      for (const [q, r] of Object.entries(questions)) {
        if (r.status === "complete" || r.status === "error") filtered[q] = r;
      }
      if (Object.keys(filtered).length > 0) persistable[wsId] = filtered;
    }
    localStorage.setItem(CACHE_PREFIX + dealId, JSON.stringify(persistable));
  } catch {}
}

function loadNavFromLocal(dealId: string): NavState {
  if (typeof window === "undefined") return { mode: "agent", selectedWorkstream: null };
  try {
    const raw = localStorage.getItem(TAB_PREFIX + dealId);
    if (!raw) return { mode: "agent", selectedWorkstream: null };
    const parsed = JSON.parse(raw) as { mode?: string; selectedWorkstream?: WorkstreamId | null };
    // Migrate legacy "assistant" → "agent" (Assistant tab renamed to Agent 2026-05-11).
    // The old multi-step "agent" workspace mode also folds into the new "agent" (assistant chat).
    const normalizedMode: string | undefined =
      parsed.mode === "assistant" ? "agent" : parsed.mode;
    const mode: DealWorkspaceMode =
      normalizedMode === "workstreams" || normalizedMode === "agent" || normalizedMode === "workflows"
        ? (normalizedMode as DealWorkspaceMode)
        : "agent";
    const selectedWorkstream = parsed.selectedWorkstream && LINKABLE_WORKSTREAMS.includes(parsed.selectedWorkstream)
      ? parsed.selectedWorkstream
      : null;
    return { mode, selectedWorkstream };
  } catch {
    const legacy = localStorage.getItem(TAB_PREFIX + dealId) as WorkstreamId | null;
    return {
      mode: legacy && LINKABLE_WORKSTREAMS.includes(legacy) ? "workstreams" : "agent",
      selectedWorkstream: legacy && LINKABLE_WORKSTREAMS.includes(legacy) ? legacy : null,
    };
  }
}

function saveNavToLocal(dealId: string, nav: NavState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TAB_PREFIX + dealId, JSON.stringify(nav));
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
  const [selectedWorkstream, setSelectedWorkstream] = useState<WorkstreamId | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [assistantHistory, setAssistantHistory] = useState<ConversationEntry[]>([]);
  const [assistantHistoryLoaded, setAssistantHistoryLoaded] = useState(false);
  const [selectedAssistantEntryId, setSelectedAssistantEntryId] = useState<string | null>(null);
  const [assistantNewChatSignal, setAssistantNewChatSignal] = useState(0);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ prompt: string; signal: number } | null>(null);
  const [proactiveScanAutoRunSignal, setProactiveScanAutoRunSignal] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocCoverage | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDocError, setDeleteDocError] = useState<string | null>(null);
  const [resultCache, setResultCache] = useState<WorkstreamCache>({});
  const [activeCit, setActiveCit] = useState<{ c: Citation; id: string } | null>(null);
  const { findings, addFindings, syncScanFindings } = useFindings(dealId);

  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);

  useEffect(() => {
    const nav = loadNavFromLocal(dealId);
    setMode(nav.mode);
    setSelectedWorkstream(nav.selectedWorkstream);
    setResultCache(loadCacheFromLocal(dealId));
  }, [dealId]);

  useEffect(() => {
    saveNavToLocal(dealId, { mode, selectedWorkstream });
  }, [dealId, mode, selectedWorkstream]);

  const updateCacheForWorkstream = useCallback(
    (workstreamId: string, results: Record<string, QuestionResult>) => {
      setResultCache((prev) => {
        const next = { ...prev, [workstreamId]: results };
        saveCacheToLocal(dealId, next);
        return next;
      });
    },
    [dealId]
  );

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
        setSelectedWorkstream(null);
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

  const docCoverage = useMemo(
    () => computeCoverage(documents, resultCache, findings),
    [documents, resultCache, findings]
  );
  const dealBreakers = findings.filter((f) => f.sev === "deal-breaker").length;

  const scanCache = resultCache["proactive_scan"];
  useEffect(() => {
    if (!scanCache) return;
    const templates =
      DD_WORKSTREAMS.find((w) => w.id === "proactive_scan")?.templates || [];
    syncScanFindings(extractScanFindings(scanCache, templates));
  }, [scanCache, syncScanFindings]);

  useEffect(() => {
    setAssistantHistoryLoaded(false);
    setSelectedAssistantEntryId(null);
  }, [dealId]);

  const onSelectFinding = useCallback((finding: Finding) => {
    setActiveCit(null);
    setSelectedQuestion(finding.qid);
    setMode("workstreams");
    setSelectedWorkstream(LINKABLE_WORKSTREAMS.includes(finding.ws) ? finding.ws : null);
  }, []);

  const onOpenFindingSource = useCallback((finding: Finding) => {
    if (!finding.sourceCitation) return;
    handleViewDocument(finding.sourceCitation);
  }, [handleViewDocument]);

  const handleMode = useCallback((nextMode: DealWorkspaceMode) => {
    setMode(nextMode);
    if (nextMode === "agent" || nextMode === "workflows") {
      setSelectedWorkstream(null);
      setSelectedQuestion(null);
      setActiveCit(null);
      setSelectedDocId(null);
    }
  }, []);

  const handleNewAssistantChat = useCallback(() => {
    setMode("agent");
    setSelectedWorkstream(null);
    setSelectedQuestion(null);
    setSelectedDocId(null);
    setActiveCit(null);
    setSelectedAssistantEntryId(null);
    setAssistantNewChatSignal((signal) => signal + 1);
  }, []);

  const handleSelectAssistantHistory = useCallback((entry: ConversationEntry) => {
    setMode("agent");
    setSelectedWorkstream(null);
    setSelectedQuestion(null);
    setSelectedDocId(null);
    setActiveCit(null);
    setSelectedAssistantEntryId(entry.id);
  }, []);

  const handleAssistantConversationSaved = useCallback((entry: ConversationEntry) => {
    setSelectedAssistantEntryId(entry.id);
    setAssistantHistory((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
    void fetchAssistantHistory();
  }, [fetchAssistantHistory]);

  const handleProactiveScan = useCallback(() => {
    setMode("workstreams");
    setSelectedWorkstream("proactive_scan");
    setSelectedDocId(null);
    setSelectedQuestion(null);
    setActiveCit(null);
    setProactiveScanAutoRunSignal((n) => n + 1);
  }, []);

  const handleAskAboutDocument = useCallback((docName: string, prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const scoped = `Focus exclusively on the document "${docName}". ${trimmed}`;
    setMode("agent");
    setSelectedWorkstream(null);
    setSelectedQuestion(null);
    setActiveCit(null);
    setSelectedDocId(null);
    setPendingPrompt({ prompt: scoped, signal: Date.now() });
  }, []);

  const handleDeleteDocument = useCallback(async () => {
    if (!confirmDeleteDoc) return;
    setDeletingDocId(confirmDeleteDoc.id);
    setDeleteDocError(null);
    try {
      await deleteDocument(dealId, confirmDeleteDoc.id);
      setDocuments((prev) => prev.filter((doc) => doc.doc_id !== confirmDeleteDoc.id));
      if (selectedDocId === confirmDeleteDoc.id) setSelectedDocId(null);
      setViewerState((prev) =>
        prev?.filename === confirmDeleteDoc.name ? null : prev
      );
      setConfirmDeleteDoc(null);
      await Promise.all([fetchDeal(), fetchDocuments()]);
    } catch (err) {
      setDeleteDocError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeletingDocId(null);
    }
  }, [confirmDeleteDoc, dealId, fetchDeal, fetchDocuments, selectedDocId]);

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

  const activeWorkstream = selectedWorkstream
    ? DD_WORKSTREAMS.find((workstream) => workstream.id === selectedWorkstream)
    : null;

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
        onExport={() => setShowReport(true)}
        onBack={() => router.push("/")}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {mode !== "workflows" && (
          <LeftSidebar
            mode={mode}
            findings={findings}
            docs={docCoverage}
            assistantHistory={assistantHistory}
            assistantHistoryLoaded={assistantHistoryLoaded}
            activeAssistantEntryId={selectedAssistantEntryId}
            activeWs={selectedWorkstream}
            activeDocId={selectedDocId}
            theme={theme}
            onNewAssistantChat={handleNewAssistantChat}
            onSelectAssistantHistory={handleSelectAssistantHistory}
            onSelectDocument={(docId) => {
              setSelectedDocId(docId);
              if (docId) {
                setSelectedWorkstream(null);
                setSelectedQuestion(null);
                setActiveCit(null);
              }
            }}
            onDeleteDocument={(doc) => setConfirmDeleteDoc(doc)}
            onSelectFinding={onSelectFinding}
            onOpenSource={onOpenFindingSource}
          />
        )}

        <main style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0, background: c.bg }}>
          {mode === "workflows" ? (
            <WorkflowsView dealId={dealId} theme={theme} />
          ) : mode === "agent" ? (
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
                pendingPrompt={pendingPrompt?.prompt ?? null}
                pendingPromptSignal={pendingPrompt?.signal ?? 0}
              />
            </div>
          ) : selectedDocId ? (
            (() => {
              const doc = docCoverage.find((d) => d.id === selectedDocId);
              if (!doc) return null;
              return (
                <DocumentDetailView
                  doc={doc}
                  findings={findings}
                  theme={theme}
                  onBack={() => setSelectedDocId(null)}
                  onSelectFinding={onSelectFinding}
                  onOpenSource={onOpenFindingSource}
                  onAsk={(prompt) => handleAskAboutDocument(doc.name, prompt)}
                />
              );
            })()
          ) : activeWorkstream ? (
            <div style={{ flex: 1, width: "100%", minWidth: 0, display: "flex", overflow: "hidden", borderRight: activeCit ? `1px solid ${c.border}` : "none" }}>
              {activeWorkstream.id === "proactive_scan" ? (
                <ProactiveScanPanel
                  dealId={dealId}
                  workstream={activeWorkstream}
                  cachedResults={resultCache[activeWorkstream.id] || {}}
                  onResultsChange={(results) => updateCacheForWorkstream(activeWorkstream.id, results)}
                  onViewDocument={handleViewDocument}
                  autoRunSignal={proactiveScanAutoRunSignal}
                />
              ) : (
                <DDWorkstreamView
                  dealId={dealId}
                  workstream={activeWorkstream}
                  cachedResults={resultCache[activeWorkstream.id] || {}}
                  onResultsChange={(results) => updateCacheForWorkstream(activeWorkstream.id, results)}
                  activeCitId={activeCit?.id ?? null}
                  onCit={handleCit}
                  focusQuery={selectedQuestion}
                  onBack={() => {
                    setSelectedWorkstream(null);
                    setSelectedQuestion(null);
                    setActiveCit(null);
                  }}
                />
              )}
            </div>
          ) : (
            <WorkstreamListView
              dealId={dealId}
              workstreams={DD_WORKSTREAMS}
              resultCache={resultCache}
              findings={findings}
              theme={theme}
              onSelectFinding={onSelectFinding}
              onCit={handleCit}
              onCacheUpdate={updateCacheForWorkstream}
              onSelect={(workstreamId) => {
                setSelectedWorkstream(workstreamId);
                setSelectedQuestion(null);
                setActiveCit(null);
              }}
            />
          )}

          {activeCit && (mode === "workstreams" || mode === "agent") && (
            <CitationPanel
              citation={activeCit.c}
              onClose={() => setActiveCit(null)}
              onOpenDocument={handleViewDocument}
            />
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

      {showReport && (
        <ReportModal
          deal={deal}
          resultCache={resultCache}
          onClose={() => setShowReport(false)}
        />
      )}

      {confirmDeleteDoc && (
        <ConfirmDialog
          title="Delete Document"
          message={
            deleteDocError ||
            `Remove "${confirmDeleteDoc.name}" and all of its indexed chunks? This cannot be undone.`
          }
          confirmLabel={deletingDocId === confirmDeleteDoc.id ? "Deleting..." : "Delete"}
          onConfirm={handleDeleteDocument}
          onCancel={() => {
            if (deletingDocId) return;
            setDeleteDocError(null);
            setConfirmDeleteDoc(null);
          }}
        />
      )}
    </div>
  );
}
