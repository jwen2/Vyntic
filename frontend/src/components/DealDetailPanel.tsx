"use client";
import { useState, useEffect } from "react";
import { Deal, DocumentMetadata, listDocuments } from "@/lib/api";

interface Props {
  deal: Deal;
}

export default function DealDetailPanel({ deal }: Props) {
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listDocuments(deal.deal_id)
      .then((data) => {
        if (!cancelled) setDocs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deal.deal_id]);

  const fileIcon = (filename: string) => {
    if (filename.endsWith(".pdf")) return "📄";
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) return "📊";
    return "📎";
  };

  return (
    <div className="mt-2 pl-2 border-l-2 border-blue-200 space-y-1.5">
      {deal.description && (
        <p className="text-xs text-gray-500 italic">{deal.description}</p>
      )}

      <div className="text-xs font-medium text-gray-600">Documents</div>

      {loading && (
        <div className="text-xs text-gray-400 animate-pulse">Loading...</div>
      )}

      {error && (
        <div className="text-xs text-red-500">{error}</div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="text-xs text-gray-400">No documents uploaded</div>
      )}

      {docs.map((doc) => (
        <div
          key={doc.doc_id}
          className="flex items-start gap-2 p-1.5 rounded bg-white border border-gray-100"
        >
          <span className="text-sm leading-none mt-0.5">
            {fileIcon(doc.filename)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-gray-700 truncate">
              {doc.filename}
            </div>
            <div className="text-[10px] text-gray-400">
              {doc.page_count > 0 && `${doc.page_count} pages · `}
              {doc.chunk_count} chunks
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
