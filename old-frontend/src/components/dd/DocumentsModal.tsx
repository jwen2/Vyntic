"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocumentMetadata } from "@/lib/api";
import { deleteDocument } from "@/lib/api";
import { ACCENT, ddTheme } from "./types";

// Compact document-management surface that replaces the Documents sidebar
// from the retired Workstreams tab (PR #80). Opens from the TopBar; shows
// each doc with page count and a delete affordance.

interface Props {
  dealId: string;
  documents: DocumentMetadata[];
  theme: "light" | "dark";
  onClose: () => void;
  /** Fires after a successful delete so the parent can refresh state. */
  onDocumentDeleted: (docId: string) => void;
}

export default function DocumentsModal({
  dealId,
  documents,
  theme,
  onClose,
  onDocumentDeleted,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape (only when no inline confirm is open).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmId) {
        setConfirmId(null);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmId, onClose]);

  const handleDelete = useCallback(
    async (doc: DocumentMetadata) => {
      setDeletingId(doc.doc_id);
      setError(null);
      try {
        await deleteDocument(dealId, doc.doc_id);
        onDocumentDeleted(doc.doc_id);
        setConfirmId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete document");
      } finally {
        setDeletingId(null);
      }
    },
    [dealId, onDocumentDeleted],
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          boxShadow: isDark ? "0 24px 64px rgba(0,0,0,.5)" : "0 24px 64px rgba(15,23,42,.18)",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.t1 }}>Documents</div>
            <div style={{ fontSize: 11, color: c.t3, marginTop: 2 }}>
              {documents.length} document{documents.length === 1 ? "" : "s"} in this deal
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              color: c.t2,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            padding: "10px 20px",
            background: isDark ? "#7f1d1d22" : "#fff1f2",
            color: isDark ? "#fca5a5" : "#b91c1c",
            fontSize: 12,
            borderBottom: `1px solid ${c.border}`,
          }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {documents.length === 0 ? (
            <div style={{ padding: 24, fontSize: 12, color: c.t3, textAlign: "center" }}>
              No documents in this deal yet.
            </div>
          ) : (
            documents.map((doc) => {
              const confirming = confirmId === doc.doc_id;
              const deleting = deletingId === doc.doc_id;
              return (
                <div
                  key={doc.doc_id}
                  style={{
                    padding: "10px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderBottom: `1px solid ${c.borderLight}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: c.t1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }} title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div style={{ fontSize: 10, color: c.t3, marginTop: 2 }}>
                      {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
                      {doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ""}
                    </div>
                  </div>
                  {confirming ? (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={deleting}
                        style={{
                          padding: "4px 10px",
                          background: "transparent",
                          border: `1px solid ${c.border}`,
                          borderRadius: 5,
                          color: c.t2,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: deleting ? "default" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deleting}
                        style={{
                          padding: "4px 10px",
                          background: isDark ? "#7f1d1d" : "#dc2626",
                          border: "none",
                          borderRadius: 5,
                          color: "white",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: deleting ? "wait" : "pointer",
                        }}
                      >
                        {deleting ? "Deleting…" : "Confirm delete"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setError(null);
                        setConfirmId(doc.doc_id);
                      }}
                      aria-label={`Delete ${doc.filename}`}
                      title={`Delete ${doc.filename}`}
                      style={{
                        width: 28,
                        height: 28,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isDark ? "#7f1d1d22" : "#fff1f2",
                        border: `1px solid ${isDark ? "#7f1d1d55" : "#fecaca"}`,
                        borderRadius: 6,
                        color: isDark ? "#fca5a5" : "#dc2626",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v5" />
                        <path d="M14 11v5" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{
          padding: "10px 20px",
          borderTop: `1px solid ${c.border}`,
          fontSize: 11,
          color: c.t3,
        }}>
          Deletion removes the document and all of its indexed chunks. Existing run
          history that references the document stays intact but won&apos;t re-execute.
        </div>
      </div>
    </div>
  );
}
