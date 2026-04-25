"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AgentAnalysisPage from "@/components/agent/AgentAnalysisPage";
import DocumentViewer from "@/components/DocumentViewer";
import type { Citation, Deal, DocumentMetadata } from "@/lib/api";
import {
  clearAuthToken,
  getAuthToken,
  getMe,
  listDeals,
  listDocuments,
} from "@/lib/api";

export default function AgentRoutePage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerState, setViewerState] = useState<{
    dealId: string;
    filename: string;
    page: number;
    snippet: string;
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      await getMe();
      const [deals, docs] = await Promise.all([listDeals(), listDocuments(dealId)]);
      setDeal(deals.find((item) => item.deal_id === dealId) || null);
      setDocuments(docs);
    } catch {
      clearAuthToken();
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [dealId, router]);

  useEffect(() => {
    load();
  }, [load]);

  function handleOpenDocument(citation: Citation) {
    setViewerState({
      dealId,
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
        <div className="dd-spin" style={{ width: 28, height: 28, border: "3px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%" }} />
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#e2e8f0" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Deal not found</h1>
          <button onClick={() => router.push("/")} style={{ padding: "8px 14px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
            Back to deals
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <AgentAnalysisPage deal={deal} documents={documents} onOpenDocument={handleOpenDocument} />
      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}
    </>
  );
}
