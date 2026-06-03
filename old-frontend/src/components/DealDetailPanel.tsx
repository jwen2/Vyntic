"use client";
import { useState, useEffect } from "react";
import { Deal, DocumentMetadata, listDocuments, deleteDocument } from "@/lib/api";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  deal: Deal;
  onDocumentDeleted?: () => void;
}

function DocRow({
  doc,
  deletingId,
  onDelete,
  fileIcon,
}: {
  doc: DocumentMetadata;
  deletingId: string | null;
  onDelete: (doc: DocumentMetadata) => void;
  fileIcon: (filename: string) => string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-start gap-2 p-1.5 rounded bg-white border border-gray-100"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      <button
        onClick={() => onDelete(doc)}
        disabled={deletingId === doc.doc_id}
        className="text-gray-300 hover:text-red-500 transition-all text-xs mt-0.5 disabled:opacity-50"
        style={{ opacity: hovered || deletingId === doc.doc_id ? 1 : 0 }}
        title="Delete document"
      >
        {deletingId === doc.doc_id ? "…" : "✕"}
      </button>
    </div>
  );
}

export default function DealDetailPanel({ deal, onDocumentDeleted }: Props) {
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<DocumentMetadata | null>(null);

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

  const handleDelete = async (doc: DocumentMetadata) => {
    setConfirmDoc(null);
    setDeletingId(doc.doc_id);
    try {
      await deleteDocument(deal.deal_id, doc.doc_id);
      setDocs((prev) => prev.filter((d) => d.doc_id !== doc.doc_id));
      onDocumentDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

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
        <DocRow
          key={doc.doc_id}
          doc={doc}
          deletingId={deletingId}
          onDelete={(d) => setConfirmDoc(d)}
          fileIcon={fileIcon}
        />
      ))}

      {confirmDoc && (
        <ConfirmDialog
          title="Delete Document"
          message={`Remove "${confirmDoc.filename}" and all its indexed chunks? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDoc)}
          onCancel={() => setConfirmDoc(null)}
        />
      )}
    </div>
  );
}
