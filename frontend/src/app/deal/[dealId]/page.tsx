"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Deal,
  Citation,
  listDeals,
  listDocuments,
  listInvestigations,
  deleteDocument,
  DocumentMetadata,
  getMe,
  getAuthToken,
} from "@/lib/api";
import type { InvestigationSummary } from "@/lib/api";
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
import AgentWorkspaceView from "@/components/dd/AgentWorkspaceView";
import DealAssistantPanel from "@/components/assistant/DealAssistantPanel";
import WorkstreamListView from "@/components/dd/WorkstreamListView";
import DocumentDetailView from "@/components/dd/DocumentDetailView";
import ProactiveScanPanel from "@/components/ProactiveScanPanel";
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
  if (typeof window === "undefined") return { mode: "assistant", selectedWorkstream: null };
  try {
    const raw = localStorage.getItem(TAB_PREFIX + dealId);
    if (!raw) return { mode: "assistant", selectedWorkstream: null };
    const parsed = JSON.parse(raw) as Partial<NavState>;
    const mode =
      parsed.mode === "workstreams" || parsed.mode === "agent"
        ? parsed.mode
        : "assistant";
    const selectedWorkstream = parsed.selectedWorkstream && LINKABLE_WORKSTREAMS.includes(parsed.selectedWorkstream)
      ? parsed.selectedWorkstream
      : null;
    return { mode, selectedWorkstream };
  } catch {
    const legacy = localStorage.getItem(TAB_PREFIX + dealId) as WorkstreamId | null;
    return {
      mode: legacy && LINKABLE_WORKSTREAMS.includes(legacy) ? "workstreams" : "assistant",
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
  const [mode, setMode] = useState<DealWorkspaceMode>("assistant");
  const [selectedWorkstream, setSelectedWorkstream] = useState<WorkstreamId | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState<string | null>(null);
  const [selectedAgentFinding, setSelectedAgentFinding] = useState<Finding | null>(null);
  const [agentFocusNonce, setAgentFocusNonce] = useState(0);
  const [agentHistory, setAgentHistory] = useState<InvestigationSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [pendingAgentPrompt, setPendingAgentPrompt] = useState<{ prompt: string; signal: number } | null>(null);
  const [proactiveScanAutoRunSignal, setProactiveScanAutoRunSignal] = useState(0);
  const [agentHistoryLoaded, setAgentHistoryLoaded] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocCoverage | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDocError, setDeleteDocError] = useState<string | null>(null);
  const [resultCache, setResultCache] = useState<WorkstreamCache>({});
  const [activeCit, setActiveCit] = useState<{ c: Citation; id: string } | null>(null);
  const {
    findings,
    addFindings,
    clearAgentFindings,
    syncScanFindings,
    syncAgentFindings,
  } = useFindings(dealId);

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

  const citationFromFinding = useCallback((finding: Finding): Citation | null => {
    if (finding.sourceCitation) return finding.sourceCitation;
    const match = finding.src.match(/^(.+?)\s+[·-]\s+p\.?(\d+)$/i);
    if (!match) return null;
    return {
      source_file: match[1].trim(),
      page: Number.parseInt(match[2], 10),
      text_snippet: finding.detail,
    };
  }, []);

  const handleCit = useCallback((citation: Citation, id: string) => {
    setActiveCit((prev) => (prev?.id === id ? null : { c: citation, id }));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode("assistant");
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

  const fetchAgentHistory = useCallback(async () => {
    try {
      const items = await listInvestigations(dealId);
      setAgentHistory(items);
      setAgentHistoryLoaded(true);
    } catch {
      setAgentHistory([]);
      setAgentHistoryLoaded(true);
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
      fetchAgentHistory(),
      getMe().catch(() => router.push("/login")),
    ]).finally(() => setLoading(false));
  }, [fetchAgentHistory, fetchDeal, fetchDocuments, router]);

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
    setAgentHistoryLoaded(false);
  }, [dealId]);

  useEffect(() => {
    if (!agentHistoryLoaded) return;
    syncAgentFindings(new Set(agentHistory.map((session) => session.id)));
  }, [agentHistory, agentHistoryLoaded, syncAgentFindings]);

  const onSelectFinding = useCallback((finding: Finding) => {
    setActiveCit(null);
    setSelectedQuestion(finding.qid);
    setSelectedAgentFinding(null);

    if (finding.origin === "agent") {
      if (!finding.producerId) {
        const citation = citationFromFinding(finding);
        if (citation) {
          handleViewDocument(citation);
          return;
        }
        setMode("workstreams");
        setSelectedAgentRunId(null);
        setSelectedWorkstream(LINKABLE_WORKSTREAMS.includes(finding.ws) ? finding.ws : null);
        return;
      }
      setMode("agent");
      setSelectedWorkstream(null);
      setSelectedAgentRunId(finding.producerId || null);
      setSelectedAgentFinding(finding);
      setAgentFocusNonce((nonce) => nonce + 1);
      return;
    }

    setMode("workstreams");
    setSelectedAgentRunId(null);
    setSelectedWorkstream(LINKABLE_WORKSTREAMS.includes(finding.ws) ? finding.ws : null);
  }, [citationFromFinding, handleViewDocument]);

  const onOpenFindingSource = useCallback((finding: Finding) => {
    if (!finding.sourceCitation) return;
    handleViewDocument(finding.sourceCitation);
  }, [handleViewDocument]);

  const handleMode = useCallback((nextMode: DealWorkspaceMode) => {
    setMode(nextMode);
    if (nextMode === "assistant" || nextMode === "agent") {
      setSelectedWorkstream(null);
      setSelectedQuestion(null);
      setSelectedAgentFinding(null);
      setActiveCit(null);
      setSelectedDocId(null);
    } else {
      setSelectedAgentRunId(null);
    }
  }, []);

  const handleSelectAgentSession = useCallback((sessionId: string) => {
    setMode("agent");
    setSelectedWorkstream(null);
    setSelectedQuestion(null);
    setSelectedAgentFinding(null);
    setActiveCit(null);
    setSelectedDocId(null);
    setSelectedAgentRunId(sessionId);
    setAgentFocusNonce((nonce) => nonce + 1);
  }, []);

  const handleMissingAgentSession = useCallback((sessionId: string) => {
    setSelectedAgentRunId((current) => (current === sessionId ? null : current));
    setSelectedAgentFinding((current) =>
      current?.producerId === sessionId ? null : current
    );
    void fetchAgentHistory();
  }, [fetchAgentHistory]);

  const handleAgentProactiveScan = useCallback(() => {
    setMode("workstreams");
    setSelectedWorkstream("proactive_scan");
    setSelectedDocId(null);
    setSelectedQuestion(null);
    setSelectedAgentRunId(null);
    setSelectedAgentFinding(null);
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
    setSelectedAgentFinding(null);
    setSelectedAgentRunId(null);
    setActiveCit(null);
    setSelectedDocId(null);
    setPendingAgentPrompt({ prompt: scoped, signal: Date.now() });
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
        <LeftSidebar
          mode={mode}
          findings={findings}
          docs={docCoverage}
          sessions={agentHistory}
          activeSessionId={selectedAgentRunId}
          activeWs={selectedWorkstream}
          activeDocId={selectedDocId}
          theme={theme}
          onSelectSession={handleSelectAgentSession}
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

        <main style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0, background: c.bg }}>
          {mode === "agent" ? (
            <AgentWorkspaceView
              deal={deal}
              documents={documents}
              onFindings={addFindings}
              onOpenDocument={handleViewDocument}
              onExport={() => setShowReport(true)}
              onClearFindings={clearAgentFindings}
              focusInvestigationId={selectedAgentRunId}
              focusFinding={selectedAgentFinding}
              focusSignal={agentFocusNonce}
              onHistoryChange={fetchAgentHistory}
              onMissingInvestigation={handleMissingAgentSession}
              pendingPrompt={pendingAgentPrompt?.prompt ?? null}
              pendingPromptSignal={pendingAgentPrompt?.signal ?? 0}
              onProactiveScan={handleAgentProactiveScan}
            />
          ) : mode === "assistant" ? (
            <div style={{ flex: 1, width: "100%", minWidth: 0, display: "flex", overflow: "hidden", borderRight: activeCit ? `1px solid ${c.border}` : "none" }}>
              <DealAssistantPanel
                deal={deal}
                documents={documents}
                activeCitId={activeCit?.id ?? null}
                onCit={handleCit}
                onOpenDocument={handleViewDocument}
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
                setSelectedAgentRunId(null);
                setActiveCit(null);
              }}
            />
          )}

          {activeCit && (mode === "workstreams" || mode === "assistant") && (
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
