"use client";
import { useState, useEffect, useCallback } from "react";
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
import WorkstreamTabs from "@/components/WorkstreamTabs";
import WorkstreamPanel, { QuestionResult } from "@/components/WorkstreamPanel";
import RiskScorecard from "@/components/RiskScorecard";
import DocMatrixPanel from "@/components/DocMatrixPanel";
import DocumentViewer from "@/components/DocumentViewer";
import ConversationHistory from "@/components/ConversationHistory";
import ReportModal from "@/components/ReportModal";
import { useTheme } from "@/components/ThemeProvider";

/** Session-level cache: workstreamId → { questionKey → result } */
type WorkstreamCache = Record<string, Record<string, QuestionResult>>;

// ── localStorage helpers for persisting analysis across navigation ──
const CACHE_PREFIX = "vyntic_ws_cache_";
const TAB_PREFIX = "vyntic_ws_tab_";

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
        if (r.status === "complete" || r.status === "error") {
          filtered[q] = r;
        }
      }
      if (Object.keys(filtered).length > 0) {
        persistable[wsId] = filtered;
      }
    }
    localStorage.setItem(CACHE_PREFIX + dealId, JSON.stringify(persistable));
  } catch {}
}

function loadTabFromLocal(dealId: string): WorkstreamId {
  if (typeof window === "undefined") return "documents";
  try {
    const raw = localStorage.getItem(TAB_PREFIX + dealId);
    if (raw && ["financial", "commercial", "operational", "legal", "risk", "documents"].includes(raw)) {
      return raw as WorkstreamId;
    }
  } catch {}
  return "documents";
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
  const [activeTab, setActiveTab] = useState<WorkstreamId>("documents");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [resultCache, setResultCache] = useState<WorkstreamCache>({});

  useEffect(() => {
    setActiveTab(loadTabFromLocal(dealId));
    setResultCache(loadCacheFromLocal(dealId));
  }, [dealId]);

  const [showReport, setShowReport] = useState(false);

  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);

  const handleViewDocument = useCallback(
    (citation: Citation) => {
      setViewerState({
        dealId: dealId,
        filename: citation.source_file,
        page: citation.page,
        snippet: citation.text_snippet || "",
      });
    },
    [dealId]
  );

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

  useEffect(() => {
    saveTabToLocal(dealId, activeTab);
  }, [dealId, activeTab]);

  const fetchDeal = useCallback(async () => {
    try {
      const deals = await listDeals();
      const found = deals.find((d) => d.deal_id === dealId);
      if (found) {
        setDeal(found);
      }
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

  const activeWorkstream = DD_WORKSTREAMS.find((w) => w.id === activeTab);

  const docMatrixTab = {
    id: "documents" as WorkstreamId,
    name: "Doc Matrix",
    icon: "📋",
    questionCount: documents.length,
    completedCount: documents.length,
  };

  const workstreamTabs = DD_WORKSTREAMS.map((w) => {
    const cached = resultCache[w.id] || {};
    const completedCount = w.templates.filter(
      (t) => cached[t.query]?.status === "complete"
    ).length;
    return {
      id: w.id,
      name: w.name,
      icon: w.icon,
      questionCount: w.templates.length,
      completedCount,
    };
  });

  const tabs = [docMatrixTab, ...workstreamTabs];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full" />
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Back to deals"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <img src="/logo.jpg" alt="Vyntic" className="h-7 w-auto" />
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{deal.name}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">
                    {deal.deal_id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-medium ${
                      deal.stage === "Due Diligence"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : deal.stage === "IC Review"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                        : deal.stage === "Closed"
                        ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    }`}
                  >
                    {deal.stage}
                  </span>
                  {deal.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {documents.length} document{documents.length !== 1 ? "s" : ""}
            </div>
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setShowReport(true)}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Generate IC Report
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
            {user?.is_admin && (
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Upload Docs
              </button>
            )}
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Matrix View
            </button>
          </div>
        </div>
      </header>

      {/* Upload panel (collapsible) */}
      {showUpload && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="max-w-[1600px] mx-auto">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                {uploading ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Choose Files (PDF, Excel)
                  </>
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
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {documents.length > 0 ? (
                  <span>
                    {documents.map((d) => d.filename).join(", ")}
                  </span>
                ) : (
                  "No documents uploaded yet"
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workstream tabs */}
      <WorkstreamTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Content */}
      <div className="flex-1 bg-white dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto h-full">
          {activeTab === "documents" ? (
            <DocMatrixPanel
              documents={documents}
              dealId={dealId}
              onViewDocument={handleViewDocument}
            />
          ) : (
            <>
              {activeTab === "risk" && activeWorkstream && (
                <RiskScorecard
                  results={resultCache["risk"] || {}}
                  questionLabels={activeWorkstream.templates}
                />
              )}
              {activeWorkstream && (
                <WorkstreamPanel
                  dealId={dealId}
                  workstream={activeWorkstream}
                  cachedResults={resultCache[activeTab] || {}}
                  onResultsChange={(results) =>
                    updateCacheForWorkstream(activeTab, results)
                  }
                  onViewDocument={handleViewDocument}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Document viewer slide-over */}
      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}

      {/* Conversation history slide-over */}
      {showHistory && (
        <ConversationHistory
          dealId={dealId}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* IC Report modal */}
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
