"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Deal,
  Citation,
  User,
  listDeals,
  listDocuments,
  uploadDocumentsBatch,
  DocumentMetadata,
  getMe,
  getAuthToken,
} from "@/lib/api";
import { DD_WORKSTREAMS, WorkstreamId } from "@/lib/queryTemplates";
import DocMatrixPanel from "@/components/DocMatrixPanel";
import DocumentViewer from "@/components/DocumentViewer";
import ConversationHistory from "@/components/ConversationHistory";
import ProactiveScanPanel from "@/components/ProactiveScanPanel";
import ReportModal from "@/components/ReportModal";
import RiskScorecard from "@/components/RiskScorecard";
import { useTheme } from "@/components/ThemeProvider";
import type { QuestionResult } from "@/components/WorkstreamPanel";

import TopBar from "@/components/dd/TopBar";
import RedFlagBanner from "@/components/dd/RedFlagBanner";
import LeftSidebar from "@/components/dd/LeftSidebar";
import WsTabs, { WsTab } from "@/components/dd/WsTabs";
import DDWorkstreamView from "@/components/dd/DDWorkstreamView";
import CitationPanel from "@/components/dd/CitationPanel";
import AgentOverlay from "@/components/dd/AgentOverlay";
import { useFindings } from "@/components/dd/useFindings";
import { computeCoverage, overallCoverage } from "@/components/dd/coverage";
import { extractScanFindings } from "@/components/dd/extractScanFindings";
import type { Finding } from "@/components/dd/types";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;
type LeftTab = "flags" | "docs";

const CACHE_PREFIX = "vyntic_ws_cache_";
const TAB_PREFIX = "vyntic_ws_tab_";
const BANNER_PREFIX = "vyntic_banner_dismissed_";

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

const VALID_TABS: WorkstreamId[] = [
  "financial",
  "commercial",
  "operational",
  "legal",
  "risk",
  "documents",
  "proactive_scan",
];

function loadTabFromLocal(dealId: string): WorkstreamId {
  if (typeof window === "undefined") return "financial";
  try {
    const raw = localStorage.getItem(TAB_PREFIX + dealId);
    if (raw && VALID_TABS.includes(raw as WorkstreamId)) return raw as WorkstreamId;
  } catch {}
  return "financial";
}

function saveTabToLocal(dealId: string, tab: WorkstreamId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TAB_PREFIX + dealId, tab);
  } catch {}
}

export default function DealWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;
  const { theme, toggleTheme } = useTheme();

  const [user, setUser] = useState<User | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkstreamId>("financial");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [resultCache, setResultCache] = useState<WorkstreamCache>({});

  // DD workspace state
  const [leftTab, setLeftTab] = useState<LeftTab>("flags");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [activeCit, setActiveCit] = useState<{ c: Citation; id: string } | null>(null);
  const { findings, addFindings, setStatus, setNote, syncScanFindings } = useFindings(dealId);

  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);

  // ── Init from localStorage ──
  useEffect(() => {
    setActiveTab(loadTabFromLocal(dealId));
    setResultCache(loadCacheFromLocal(dealId));
    if (typeof window !== "undefined") {
      try {
        setBannerDismissed(localStorage.getItem(BANNER_PREFIX + dealId) === "1");
      } catch {}
    }
  }, [dealId]);

  useEffect(() => {
    saveTabToLocal(dealId, activeTab);
  }, [dealId, activeTab]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(BANNER_PREFIX + dealId, "1");
    } catch {}
  }, [dealId]);

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

  const handleCit = useCallback((c: Citation, id: string) => {
    setActiveCit((prev) => (prev?.id === id ? null : { c, id }));
  }, []);

  // ── Global ⌘K / Esc ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAgentOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (agentOpen) setAgentOpen(false);
        else if (activeCit) setActiveCit(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agentOpen, activeCit]);

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
      // deal may not have documents yet
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
      getMe().then(setUser).catch(() => router.push("/login")),
    ]).finally(() => setLoading(false));
  }, [fetchDeal, fetchDocuments, router]);

  // ── Derived data ──
  const docCoverage = useMemo(
    () => computeCoverage(documents, resultCache, findings),
    [documents, resultCache, findings]
  );
  const coverage = useMemo(() => overallCoverage(docCoverage), [docCoverage]);
  const uncovered = useMemo(() => docCoverage.filter((d) => d.uncovered), [docCoverage]);
  const dealBreakers = findings.filter((f) => f.sev === "deal-breaker").length;
  const material = findings.filter((f) => f.sev === "material").length;

  const activeWorkstream = DD_WORKSTREAMS.find((w) => w.id === activeTab);

  const wsTabs: WsTab[] = useMemo(() => {
    const docMatrixTab: WsTab = {
      id: "documents",
      name: "Doc Matrix",
      complete: documents.length,
      total: documents.length,
    };
    const streamTabs: WsTab[] = DD_WORKSTREAMS.map((w) => {
      const cached = resultCache[w.id] || {};
      const completedCount = w.templates.filter(
        (t) => cached[t.query]?.status === "complete"
      ).length;
      return {
        id: w.id,
        name: w.name,
        complete: completedCount,
        total: w.templates.length,
      };
    });
    return [docMatrixTab, ...streamTabs];
  }, [documents.length, resultCache]);

  // ── Sync Proactive Scan findings into the shared findings store ──
  const scanCache = resultCache["proactive_scan"];
  useEffect(() => {
    if (!scanCache) return;
    const templates =
      DD_WORKSTREAMS.find((w) => w.id === "proactive_scan")?.templates || [];
    syncScanFindings(extractScanFindings(scanCache, templates));
  }, [scanCache, syncScanFindings]);

  // ── Sidebar finding click: jump to workstream + expand linked question ──
  const onSelectFinding = useCallback((f: Finding) => {
    if (f.ws && f.ws !== activeTab) setActiveTab(f.ws);
    // qid-based expand is handled inside DDWorkstreamView via its internal state;
    // a cross-component bus would be overkill — clicking the finding is enough to jump.
  }, [activeTab]);

  const handleAgentComplete = useCallback(
    (newFindings: Finding[]) => {
      addFindings(newFindings);
    },
    [addFindings]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Deal not found
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No deal with ID &quot;{dealId}&quot; exists.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const showBanner = !bannerDismissed && (dealBreakers > 0 || uncovered.length > 0);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      <TopBar
        deal={deal}
        documentCount={documents.length}
        coverage={coverage}
        dealBreakers={dealBreakers}
        onAskAgent={() => setAgentOpen(true)}
        onExport={() => setShowReport(true)}
        onBack={() => router.push("/")}
        onToggleTheme={toggleTheme}
        theme={theme}
        onUpload={user?.is_admin ? () => setShowUpload((v) => !v) : undefined}
        onHistory={() => setShowHistory(true)}
        onMatrixView={() => router.push("/")}
        isAdmin={user?.is_admin}
      />

      {showBanner && (
        <RedFlagBanner
          dealBreakers={dealBreakers}
          material={material}
          uncovered={uncovered}
          onDismiss={dismissBanner}
          onViewFlags={() => setLeftTab("flags")}
        />
      )}

      {showUpload && user?.is_admin && (
        <div
          style={{
            background: "white",
            borderBottom: "1px solid #e2e8f0",
            padding: "10px 20px",
          }}
        >
          <div className="flex items-center gap-4">
            <label
              className="flex items-center gap-2 cursor-pointer"
              style={{
                padding: "6px 14px",
                background: "#2563eb",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
              }}
            >
              {uploading ? (
                <>
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Uploading...
                </>
              ) : (
                "Choose files (PDF, Excel)"
              )}
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  setUploading(true);
                  try {
                    await uploadDocumentsBatch(deal.deal_id, files);
                    fetchDocuments();
                    fetchDeal();
                  } catch (err) {
                    console.error("Upload failed:", err);
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {documents.length > 0
                ? documents.map((d) => d.filename).join(", ")
                : "No documents uploaded yet"}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LeftSidebar
          tab={leftTab}
          onTab={setLeftTab}
          findings={findings}
          docs={docCoverage}
          activeWs={activeTab}
          onSelectFinding={onSelectFinding}
          onStatus={setStatus}
          onNote={setNote}
        />

        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            background: "#f8fafc",
            borderLeft: "1px solid #e2e8f0",
            borderRight: activeCit ? "1px solid #e2e8f0" : "none",
          }}
        >
          <WsTabs tabs={wsTabs} active={activeTab} onSelect={setActiveTab} findings={findings} />

          <div className="flex-1 overflow-y-auto" style={{ background: "white" }}>
            {activeTab === "documents" ? (
              <DocMatrixPanel
                documents={documents}
                dealId={dealId}
                onViewDocument={handleViewDocument}
              />
            ) : activeTab === "proactive_scan" && activeWorkstream ? (
              <ProactiveScanPanel
                dealId={dealId}
                workstream={activeWorkstream}
                cachedResults={resultCache[activeTab] || {}}
                onResultsChange={(r) => updateCacheForWorkstream(activeTab, r)}
                onViewDocument={handleViewDocument}
              />
            ) : activeTab === "risk" && activeWorkstream ? (
              <>
                <RiskScorecard
                  results={resultCache["risk"] || {}}
                  questionLabels={activeWorkstream.templates}
                />
                <DDWorkstreamView
                  dealId={dealId}
                  workstream={activeWorkstream}
                  cachedResults={resultCache[activeTab] || {}}
                  onResultsChange={(r) => updateCacheForWorkstream(activeTab, r)}
                  activeCitId={activeCit?.id ?? null}
                  onCit={handleCit}
                />
              </>
            ) : activeWorkstream ? (
              <DDWorkstreamView
                dealId={dealId}
                workstream={activeWorkstream}
                cachedResults={resultCache[activeTab] || {}}
                onResultsChange={(r) => updateCacheForWorkstream(activeTab, r)}
                activeCitId={activeCit?.id ?? null}
                onCit={handleCit}
              />
            ) : null}
          </div>
        </div>

        {activeCit && (
          <CitationPanel
            citation={activeCit.c}
            onClose={() => setActiveCit(null)}
            onOpenDocument={handleViewDocument}
          />
        )}
      </div>

      {agentOpen && (
        <AgentOverlay
          onClose={() => setAgentOpen(false)}
          onComplete={handleAgentComplete}
          docShortNames={docCoverage.map((d) => d.short)}
        />
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

      {showHistory && (
        <ConversationHistory dealId={dealId} onClose={() => setShowHistory(false)} />
      )}

      {showReport && (
        <ReportModal
          deal={deal}
          resultCache={resultCache}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
