"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Deal,
  Citation,
  listDeals,
  listDocuments,
  uploadDocumentsBatch,
  DocumentMetadata,
} from "@/lib/api";
import { DD_WORKSTREAMS, WorkstreamId } from "@/lib/queryTemplates";
import WorkstreamTabs from "@/components/WorkstreamTabs";
import WorkstreamPanel, { QuestionResult } from "@/components/WorkstreamPanel";
import RiskScorecard from "@/components/RiskScorecard";
import DocMatrixPanel from "@/components/DocMatrixPanel";
import DocumentViewer from "@/components/DocumentViewer";

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
    // Only persist completed/error results (not loading state)
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

  const [deal, setDeal] = useState<Deal | null>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkstreamId>("documents");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Session-level result cache (survives tab switches AND navigation) ──
  const [resultCache, setResultCache] = useState<WorkstreamCache>({});

  // Initialize from exact localStorage after first client mount
  useEffect(() => {
    setActiveTab(loadTabFromLocal(dealId));
    setResultCache(loadCacheFromLocal(dealId));
  }, [dealId]);

  // ── Document viewer state ──
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

  // Persist active tab to localStorage
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
    Promise.all([fetchDeal(), fetchDocuments()]).finally(() =>
      setLoading(false)
    );
  }, [fetchDeal, fetchDocuments]);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Deal not found
          </h2>
          <p className="text-sm text-gray-500 mb-4">
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
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
                <h1 className="text-lg font-bold text-gray-900">{deal.name}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono">
                    {deal.deal_id}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-medium ${
                      deal.stage === "Due Diligence"
                        ? "bg-blue-100 text-blue-700"
                        : deal.stage === "IC Review"
                        ? "bg-purple-100 text-purple-700"
                        : deal.stage === "Closed"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {deal.stage}
                  </span>
                  {deal.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400">
              {documents.length} document{documents.length !== 1 ? "s" : ""}
            </div>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Upload Docs
            </button>
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Matrix View
            </button>
          </div>
        </div>
      </header>

      {/* Upload panel (collapsible) */}
      {showUpload && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
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
              <div className="text-xs text-gray-500">
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
      <div className="flex-1 bg-white">
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
    </div>
  );
}
