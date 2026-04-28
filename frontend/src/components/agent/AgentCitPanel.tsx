"use client";

import type { Citation } from "@/lib/api";
import type { AgentLocalCitation } from "./types";
import CitationSnippet from "../dd/CitationSnippet";

interface Props {
  citation: AgentLocalCitation;
  onClose: () => void;
  onOpenDocument?: (citation: Citation) => void;
}

function sourceType(file: string): string {
  if (file.toLowerCase().includes("cim")) return "CIM";
  if (file.toLowerCase().includes("qoe")) return "QoE Report";
  if (file.toLowerCase().includes("legal")) return "Legal DD";
  if (file.toLowerCase().includes("fin")) return "Financial Model";
  return "Source document";
}

export default function AgentCitPanel({ citation, onClose, onOpenDocument }: Props) {
  return (
    <div className="slide-in" style={{ width: 330, flexShrink: 0, display: "flex", flexDirection: "column", background: "white", overflowY: "auto", borderLeft: "1px solid #e2e8f0" }}>
      <div style={{ padding: "13px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0, background: "#fafafa" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
            Source Evidence
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {citation.source_file}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Page {citation.page}</div>
        </div>
        <button onClick={onClose} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 2 }}>
          ×
        </button>
      </div>

      <div style={{ margin: 14, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "7px 12px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{ fontSize: 10, color: "#64748b" }}>Page {citation.page}</span>
        </div>
        <div style={{ padding: 14 }}>
          {[80, 65, 90].map((width, i) => (
            <div key={i} style={{ height: 7, background: "#e2e8f0", borderRadius: 2, marginBottom: 5, width: `${width}%` }} />
          ))}
          <div style={{ background: "#fefce8", border: "1.5px solid #fde047", borderRadius: 5, padding: "8px 10px", margin: "8px 0", position: "relative" }}>
            <div style={{ position: "absolute", top: -8, left: 8, fontSize: 9, fontWeight: 700, color: "#a16207", background: "#fef9c3", padding: "1px 5px", borderRadius: 3, border: "1px solid #fde047", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Cited passage
            </div>
            <CitationSnippet sourceFile={citation.source_file} text={citation.snippet || "The agent cited this page as supporting evidence."} />
          </div>
          {[60, 75].map((width, i) => (
            <div key={i} style={{ height: 7, background: "#e2e8f0", borderRadius: 2, marginBottom: 5, width: `${width}%` }} />
          ))}
        </div>
      </div>

      <div style={{ padding: "0 14px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
          Details
        </div>
        {[
          ["Document", citation.source_file],
          ["Page", citation.page],
          ["Source type", sourceType(citation.source_file)],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#334155", maxWidth: 170, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
          </div>
        ))}
        <button
          onClick={() => onOpenDocument?.({
            source_file: citation.source_file,
            page: citation.page,
            text_snippet: citation.snippet,
          })}
          style={{ width: "100%", marginTop: 12, padding: "9px 0", background: "#0f172a", color: "white", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
        >
          Open in Document Viewer
        </button>
      </div>

      <div style={{ margin: "0 14px 14px", padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d" }}>Source grounding</span>
          <span className="font-mono-dm" style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>91%</span>
        </div>
        <div style={{ height: 4, background: "#dcfce7", borderRadius: 99, overflow: "hidden", marginBottom: 5 }}>
          <div style={{ width: "91%", height: "100%", background: "#22c55e", borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 10, color: "#16a34a", lineHeight: 1.5 }}>Snippet directly supports the agent&apos;s cited claim.</div>
      </div>
    </div>
  );
}
