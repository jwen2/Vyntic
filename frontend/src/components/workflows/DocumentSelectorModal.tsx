"use client";

import { useEffect, useMemo, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import { listDocuments, type DocumentMetadata } from "@/lib/api";
import { ACCENT, VIOLET } from "./theme";

type Theme = "light" | "dark";

interface DocumentSelectorModalProps {
  dealId: string;
  workflowName: string;
  /** Pre-selected doc ids (for re-runs). */
  initialSelected?: string[];
  theme: Theme;
  onConfirm: (documentIds: string[]) => void;
  onCancel: () => void;
}

export default function DocumentSelectorModal({
  dealId,
  workflowName,
  initialSelected = [],
  theme,
  onConfirm,
  onCancel,
}: DocumentSelectorModalProps) {
  const c = ddTheme(theme);
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          width: "min(620px, 92vw)",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${c.border}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: c.t1 }}>
            Select documents to run
          </div>
          <div style={{ fontSize: 12, color: c.t2, marginTop: 2 }}>{workflowName}</div>
        </div>

        <div
          style={{
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: `1px solid ${c.border}`,
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            style={{
              flex: 1,
              padding: "6px 10px",
              background: c.surfaceAlt,
              border: `1px solid ${c.border}`,
              borderRadius: 7,
              color: c.t1,
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={selectAll}
            style={smallBtnStyle(c, false)}
          >
            Select all
          </button>
          <button onClick={clearAll} style={smallBtnStyle(c, false)}>
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
          {loading ? (
            <div style={{ color: c.t2, fontSize: 12, textAlign: "center", padding: 24 }}>
              Loading documents…
            </div>
          ) : error ? (
            <div style={{ color: "#ef4444", fontSize: 12, textAlign: "center", padding: 24 }}>
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ color: c.t3, fontSize: 12, textAlign: "center", padding: 24 }}>
              {search ? "No documents match your search." : "No documents in this deal."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.map((doc) => {
                const checked = selected.has(doc.doc_id);
                return (
                  <label
                    key={doc.doc_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: checked ? c.surfaceAlt : "transparent",
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
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: c.t1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {doc.filename}
                      </div>
                      <div style={{ fontSize: 10, color: c.t3, marginTop: 1 }}>
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
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${c.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: c.t2 }}>
            {selected.size} of {docs.length} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={smallBtnStyle(c, false)}>
              Cancel
            </button>
            <button
              onClick={() => onConfirm(Array.from(selected))}
              disabled={selected.size === 0}
              style={{
                padding: "6px 14px",
                background: selected.size === 0 ? c.surfaceAlt : ACCENT,
                color: selected.size === 0 ? c.t3 : "white",
                border: "none",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: selected.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              Run on {selected.size} doc{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function smallBtnStyle(c: ReturnType<typeof ddTheme>, primary: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    background: primary ? ACCENT : c.surfaceAlt,
    color: primary ? "white" : c.t2,
    border: `1px solid ${c.border}`,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}
