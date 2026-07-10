
import { useCallback, useEffect, useState } from "react";
import type { DocumentMetadata } from "@/lib/api";
import { DOC_CATEGORIES, DOC_CATEGORY_LABELS, deleteDocument, updateDocumentMetadata } from "@/lib/api";
import { ACCENT, ddTheme, tint } from "./types";

// The 14 doc categories collapse into three color families so a document's
// type is scannable at a glance without 14 distinct hues. Reuses the
// stage/severity chip trios (contrast-checked); "other" falls back to neutral.
type CategoryFamily = "legal" | "financial" | "diligence" | "other";

const CATEGORY_FAMILY: Record<string, CategoryFamily> = {
  lpa: "legal",
  side_letter: "legal",
  form_adv: "legal",
  valuation_policy: "legal",
  financial_statements: "financial",
  capital_account: "financial",
  capital_call: "financial",
  distribution_notice: "financial",
  quarterly_report: "financial",
  ddq: "diligence",
  ppm: "diligence",
  pitchbook: "diligence",
  track_record: "diligence",
  other: "other",
};

const FAMILY_STYLES: Record<
  "light" | "dark",
  Record<Exclude<CategoryFamily, "other">, { bg: string; fg: string; border: string }>
> = {
  light: {
    legal: { bg: "#e9e3f8", fg: "#50309c", border: "#8e7cb6" },
    financial: { bg: "#e4f6f3", fg: "#20554c", border: "#73a59d" },
    diligence: { bg: "#f9f2e2", fg: "#624c18", border: "#b39a61" },
  },
  dark: {
    legal: { bg: "#191523", fg: "#b19fdb", border: "#332c44" },
    financial: { bg: "#152321", fg: "#59c0af", border: "#2c4440" },
    diligence: { bg: "#231f15", fg: "#c7ab6b", border: "#443d2c" },
  },
};

function categoryChipStyle(
  category: string | null | undefined,
  isDark: boolean,
  neutral: { bg: string; fg: string; border: string }
): { bg: string; fg: string; border: string } {
  const family = CATEGORY_FAMILY[category || "other"] ?? "other";
  if (family === "other") return neutral;
  return FAMILY_STYLES[isDark ? "dark" : "light"][family];
}

// Compact document-management surface that replaces the Documents sidebar
// from the retired Workstreams tab (PR #80). Opens from the TopBar; shows
// each doc with page count, LP classification controls, and a delete
// affordance.

interface Props {
  dealId: string;
  documents: DocumentMetadata[];
  theme: "light" | "dark";
  onClose: () => void;
  /** Fires after a successful delete so the parent can refresh state. */
  onDocumentDeleted: (docId: string) => void;
  /** Fires after a successful metadata change so the parent can refresh state. */
  onDocumentUpdated?: (doc: DocumentMetadata) => void;
}

export default function DocumentsModal({
  dealId,
  documents,
  theme,
  onClose,
  onDocumentDeleted,
  onDocumentUpdated,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryChange = useCallback(
    async (doc: DocumentMetadata, doc_category: string) => {
      setError(null);
      try {
        const updated = await updateDocumentMetadata(dealId, doc.doc_id, { doc_category });
        onDocumentUpdated?.(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update document");
      }
    },
    [dealId, onDocumentUpdated],
  );

  const handleScopeToggle = useCallback(
    async (doc: DocumentMetadata) => {
      setError(null);
      try {
        const updated = await updateDocumentMetadata(dealId, doc.doc_id, {
          scope: doc.scope === "manager" ? "entity" : "manager",
        });
        onDocumentUpdated?.(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update document");
      }
    },
    [dealId, onDocumentUpdated],
  );

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
                      {doc.period ? ` · ${doc.period}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => handleScopeToggle(doc)}
                    title={
                      doc.scope === "manager"
                        ? "Shared with all funds of this manager — click to keep it in this workspace only"
                        : "Visible in this workspace only — click to share across the manager's funds"
                    }
                    style={{
                      flexShrink: 0,
                      padding: "4px 8px",
                      fontSize: 10,
                      fontWeight: 600,
                      background: doc.scope === "manager" ? tint(ACCENT, 13) : "transparent",
                      color: doc.scope === "manager" ? ACCENT : c.t3,
                      border: `1px solid ${doc.scope === "manager" ? tint(ACCENT, 40) : c.border}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {doc.scope === "manager" ? "Shared" : "This workspace"}
                  </button>
                  {(() => {
                    const chip = categoryChipStyle(doc.doc_category, isDark, {
                      bg: c.surface,
                      fg: c.t2,
                      border: c.border,
                    });
                    return (
                  <select
                    value={doc.doc_category || "other"}
                    onChange={(e) => handleCategoryChange(doc, e.target.value)}
                    aria-label={`Category for ${doc.filename}`}
                    style={{
                      flexShrink: 0,
                      padding: "4px 6px",
                      fontSize: 11,
                      fontWeight: 600,
                      background: chip.bg,
                      color: chip.fg,
                      border: `1px solid ${chip.border}`,
                      borderRadius: 6,
                      cursor: "pointer",
                      maxWidth: 150,
                    }}
                  >
                    {DOC_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {DOC_CATEGORY_LABELS[cat] ?? cat}
                      </option>
                    ))}
                  </select>
                    );
                  })()}
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
