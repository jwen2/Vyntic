
import { useEffect, useMemo, useState } from "react";
import Input, { Textarea } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { listDocuments, type DocumentMetadata } from "@/lib/api";
import type { RowSource } from "@/lib/workflows";
import { ACCENT, VIOLET } from "./theme";

interface DocumentSelectorModalProps {
  dealId: string;
  workflowName: string;
  /** Pre-selected doc ids (for re-runs). */
  initialSelected?: string[];
  rowSource?: RowSource;
  /**
   * Built-in templates use the workflow name as the single synthesis row
   * (handled server-side). Skip the user-facing "synthesis rows" textarea
   * for them so they run one-click.
   */
  isBuiltin?: boolean;
  onConfirm: (documentIds: string[], synthesisQuestions?: string[]) => void;
  onCancel: () => void;
}

const smallBtnClass =
  "rounded-md border border-edge bg-surface-alt text-t2 px-2.5 py-[5px] text-[11px] font-semibold cursor-pointer";

export default function DocumentSelectorModal({
  dealId,
  workflowName,
  initialSelected = [],
  rowSource = "one_doc_per_row",
  isBuiltin = false,
  onConfirm,
  onCancel,
}: DocumentSelectorModalProps) {
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [questionsText, setQuestionsText] = useState("");
  const synthesisQuestions = useMemo(
    () =>
      questionsText
        .split("\n")
        .map((line) => line.trim().replace(/^[-*]\s+/, ""))
        .filter(Boolean),
    [questionsText]
  );
  const needsSynthesisRows = rowSource === "multi_doc_synthesis" && !isBuiltin;
  const canRun = selected.size > 0 && (!needsSynthesisRows || synthesisQuestions.length > 0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listDocuments(dealId)
      .then((items) => {
        if (!active) return;
        setDocs(items);
        if (initialSelected.length === 0) {
          setSelected(new Set(items.map((d) => d.doc_id)));
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load documents");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.filename.toLowerCase().includes(q));
  }, [docs, search]);

  function toggle(docId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((d) => d.doc_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <Modal
      onClose={onCancel}
      size="md"
      title={
        needsSynthesisRows
          ? "Select documents and synthesis rows"
          : "Select documents to run"
      }
      description={workflowName}
    >

        <div className="border-b border-b-edge flex items-center gap-2 px-5 py-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="flex-1"
            fieldSize="sm"
          />
          <button onClick={selectAll} className={smallBtnClass}>
            Select all
          </button>
          <button onClick={clearAll} className={smallBtnClass}>
            Clear
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 12px",
          }}
        >
          {needsSynthesisRows && (
            <div
              className="border border-edge bg-surface-alt rounded-lg"
              style={{
                margin: "8px 8px 12px",
                padding: 12,
              }}
            >
              <div className="text-t2" style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                Synthesis rows
              </div>
              <Textarea
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                placeholder={"One question per line, e.g.\nRevenue bridge by period\nCustomer concentration and churn risk\nAdjusted EBITDA add-backs"}
                className="resize-y"
                fieldSize="sm"
                fullWidth
              />
              <div className="text-t3" style={{ fontSize: 10, marginTop: 6 }}>
                {synthesisQuestions.length} row{synthesisQuestions.length === 1 ? "" : "s"} will run across all selected documents.
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-t2" style={{ fontSize: 12, textAlign: "center", padding: 24 }}>
              Loading documents…
            </div>
          ) : error ? (
            <div style={{ color: "var(--danger)", fontSize: 12, textAlign: "center", padding: 24 }}>
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-t3" style={{ fontSize: 12, textAlign: "center", padding: 24 }}>
              {search ? "No documents match your search." : "No documents in this deal."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.map((doc) => {
                const checked = selected.has(doc.doc_id);
                return (
                  <label
                    key={doc.doc_id}
                    className={checked ? "bg-surface-alt" : "bg-transparent"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      border: `1px solid ${checked ? VIOLET : "transparent"}`,
                      borderRadius: 7,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(doc.doc_id)}
                      style={{ accentColor: VIOLET }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="text-t1"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {doc.filename}
                      </div>
                      <div className="text-t3" style={{ fontSize: 10, marginTop: 1 }}>
                        {doc.page_count} {doc.page_count === 1 ? "page" : "pages"} ·{" "}
                        {doc.chunk_count} chunks
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="border-t border-t-edge"
          style={{
            padding: "12px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="text-t2" style={{ fontSize: 11 }}>
            {selected.size} of {docs.length} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} className={smallBtnClass}>
              Cancel
            </button>
            <button
              onClick={() => onConfirm(Array.from(selected), synthesisQuestions)}
              disabled={!canRun}
              className={!canRun ? "bg-surface-alt text-t3" : ""}
              style={{
                padding: "6px 14px",
                background: !canRun ? undefined : ACCENT,
                color: !canRun ? undefined : "var(--on-accent)",
                border: "none",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: !canRun ? "not-allowed" : "pointer",
              }}
            >
              Run
            </button>
          </div>
        </div>
    </Modal>
  );
}
