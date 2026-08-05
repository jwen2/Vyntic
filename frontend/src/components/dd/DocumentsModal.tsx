
import { useCallback, useRef, useState } from "react";
import type { DocumentMetadata, UploadProgress } from "@/lib/api";
import { DOC_CATEGORIES, DOC_CATEGORY_LABELS, deleteDocument, updateDocumentMetadata } from "@/lib/api";
import { isDemoMode } from "@/demo/mode";
import { ACCENT, tint } from "./types";
import Button from "@/components/ui/Button";
import Input, { Select } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";

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
  /** Admin-only upload entry point supplied by the workspace. */
  onUploadDocuments?: (files: File[]) => Promise<boolean>;
  uploading?: boolean;
  uploadProgress?: UploadProgress;
  uploadError?: string | null;
}

export default function DocumentsModal({
  dealId,
  documents,
  theme,
  onClose,
  onDocumentDeleted,
  onDocumentUpdated,
  onUploadDocuments,
  uploading = false,
  uploadProgress,
  uploadError,
}: Props) {
  const isDark = theme === "dark";
  /**
   * Deleting and uploading are hidden in the demo rather than faked. The corpus
   * is served from fixtures, so a "successful" delete would undo itself on the
   * next reload — and the deleted document is one the recorded run still cites.
   * An upload is worse: the file cannot be parsed or indexed, so it would land
   * with no pages, no text and no citations.
   *
   * Read here rather than taken as a prop: `deleteDocument` is called from
   * inside this component, so the guard belongs next to the call it guards. The
   * workspace withholds `onUploadDocuments` in the demo as well; this is the
   * second lock on the same door.
   */
  const demo = isDemoMode();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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

  const handlePeriodChange = useCallback(
    async (doc: DocumentMetadata, rawPeriod: string) => {
      const period = rawPeriod.trim();
      if ((doc.period ?? "") === period) return;  // no-op on unchanged blur
      setError(null);
      try {
        const updated = await updateDocumentMetadata(dealId, doc.doc_id, { period });
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

  // Escape/scrim close is guarded: an open inline confirm is dismissed first,
  // and only a second request closes the modal. <Modal> routes every close
  // path (Escape, scrim, close button) through this, so the guard can't be
  // bypassed the way a separate window-level listener could.
  const handleRequestClose = useCallback(() => {
    if (confirmId) {
      setConfirmId(null);
      return;
    }
    onClose();
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

  const handleUploadSelection = useCallback(
    (files: FileList | null) => {
      const selected = Array.from(files ?? []);
      if (selected.length > 0) void onUploadDocuments?.(selected);
    },
    [onUploadDocuments],
  );

  const uploadButton = onUploadDocuments && !demo ? (
    <>
      <Button
        variant="primary"
        size="sm"
        loading={uploading}
        onClick={() => uploadInputRef.current?.click()}
        iconLeft={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m7 8 5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
        }
      >
        {uploading ? "Uploading" : "Add documents"}
      </Button>
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.xlsx,.xls"
        multiple
        aria-label="Choose documents to upload"
        onChange={(event) => {
          handleUploadSelection(event.target.files);
          event.target.value = "";
        }}
        style={{ display: "none" }}
      />
    </>
  ) : null;

  return (
    <Modal
      onClose={handleRequestClose}
      size="lg"
      title="Documents"
      description={`${documents.length} document${documents.length === 1 ? "" : "s"} in this deal`}
      headerActions={uploadButton}
    >

        {(error || uploadError) && (
          <div className="border-b border-b-edge" style={{
            padding: "10px 20px",
            background: "var(--danger-tint)",
            color: "var(--danger)",
            fontSize: 12,
          }}>
            {error || uploadError}
          </div>
        )}

        {uploadProgress && (
          <div
            className="border-b border-b-edge bg-surface-alt"
            style={{
              padding: "10px 20px 11px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 6,
                fontSize: 11,
              }}
            >
              <span
                title={uploadProgress.detail || uploadProgress.filename || ""}
                className={uploadProgress.status === "error" ? "" : "text-t2"}
                style={{
                  color: uploadProgress.status === "error" ? "var(--danger)" : undefined,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {uploadProgress.stage || "Processing documents"}
                {uploadProgress.filename ? ` · ${uploadProgress.filename}` : ""}
              </span>
              <span className="text-t1" style={{ fontWeight: 700, flexShrink: 0 }}>
                {uploadProgress.percent}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Document upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress.percent}
              className="bg-edge-light"
              style={{
                height: 5,
                overflow: "hidden",
                borderRadius: 999,
              }}
            >
              <div
                style={{
                  width: `${uploadProgress.percent}%`,
                  height: "100%",
                  background:
                    uploadProgress.status === "error"
                      ? "var(--danger)"
                      : ACCENT,
                  transition: "width .25s ease",
                }}
              />
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "6px 0" }}>
          {documents.length === 0 ? (
            <div className="text-t3" style={{ padding: 28, fontSize: 12, textAlign: "center" }}>
              <div>No documents in this deal yet.</div>
              {onUploadDocuments && !demo && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={uploading}
                  onClick={() => uploadInputRef.current?.click()}
                  style={{ marginTop: 12 }}
                >
                  Choose documents
                </Button>
              )}
            </div>
          ) : (
            documents.map((doc) => {
              const confirming = confirmId === doc.doc_id;
              const deleting = deletingId === doc.doc_id;
              return (
                <div
                  key={doc.doc_id}
                  className="border-b border-b-edge-light"
                  style={{
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div className="text-t1" style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }} title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div className="text-t3" style={{ fontSize: 10, marginTop: 2 }}>
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
                      color: doc.scope === "manager" ? ACCENT : "var(--text-3)",
                      border: `1px solid ${doc.scope === "manager" ? tint(ACCENT, 40) : "var(--border)"}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {doc.scope === "manager" ? "Shared" : "This workspace"}
                  </button>
                  {(() => {
                    const chip = categoryChipStyle(doc.doc_category, isDark, {
                      bg: "var(--surface)",
                      fg: "var(--text-2)",
                      border: "var(--border)",
                    });
                    return (
                  <Select
                    value={doc.doc_category || "other"}
                    onChange={(e) => handleCategoryChange(doc, e.target.value)}
                    aria-label={`Category for ${doc.filename}`}
                    fieldSize="sm"
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      background: chip.bg,
                      color: chip.fg,
                      border: `1px solid ${chip.border}`,
                      cursor: "pointer",
                      maxWidth: 150,
                    }}
                  >
                    {DOC_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {DOC_CATEGORY_LABELS[cat] ?? cat}
                      </option>
                    ))}
                  </Select>
                    );
                  })()}
                  <Input
                    defaultValue={doc.period ?? ""}
                    key={`period-${doc.doc_id}-${doc.period ?? ""}`}
                    placeholder="Period"
                    aria-label={`Reporting period for ${doc.filename}`}
                    title="Reporting period, e.g. 2026-Q2 — used to match side-letter verification and monitoring"
                    onBlur={(e) => handlePeriodChange(doc, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    fieldSize="sm"
                    style={{
                      flexShrink: 0,
                      width: 78,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                  {demo ? null : confirming ? (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="secondary" size="xs" disabled={deleting} onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                      <Button variant="danger" size="xs" loading={deleting} onClick={() => handleDelete(doc)}>
                        {deleting ? "Deleting…" : "Confirm delete"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      iconOnly
                      onClick={() => {
                        setError(null);
                        setConfirmId(doc.doc_id);
                      }}
                      aria-label={`Delete ${doc.filename}`}
                      title={`Delete ${doc.filename}`}
                      style={{ flexShrink: 0 }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v5" />
                        <path d="M14 11v5" />
                      </svg>
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!demo && (
          <div className="border-t border-t-edge text-t3" style={{
            padding: "10px 16px",
            fontSize: 11,
          }}>
            Deletion removes the document and all of its indexed chunks. Existing run
            history that references the document stays intact but won&apos;t re-execute.
          </div>
        )}
    </Modal>
  );
}
