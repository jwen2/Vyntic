"use client";

import { useState } from "react";
import type { AgentLocalCitation, AgentLocalFinding, AgentTask } from "./types";
import { SEV } from "./types";

interface Props {
  finding: AgentLocalFinding;
  index: number;
  tasks: AgentTask[];
  activeCitationId: string | null;
  onCitation: (citation: AgentLocalCitation) => void;
}

function SevBadge({ sev }: { sev: AgentLocalFinding["sev"] }) {
  const s = SEV[sev];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "1px 6px",
      borderRadius: 99,
      background: s.bg,
      border: `1px solid ${s.border}`,
      fontSize: 10,
      fontWeight: 700,
      color: s.color,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />
      {s.label}
    </span>
  );
}

export default function AgentFindingCard({ finding, index, tasks, activeCitationId, onCitation }: Props) {
  const [open, setOpen] = useState(true);
  const s = SEV[finding.sev];
  const taskLabel = tasks.find((task) => task.id === finding.taskId)?.label || "Agent task";

  return (
    <div className="fade-up" style={{
      animationDelay: `${index * 0.05}s`,
      background: "white",
      border: `1px solid ${s.border}`,
      borderRadius: 10,
      overflow: "hidden",
      borderLeft: `3px solid ${s.dot}`,
    }}>
      <div
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#fafafa";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "white";
        }}
        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", cursor: "pointer" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <SevBadge sev={finding.sev} />
            <span style={{ fontSize: 10, color: "#94a3b8" }}>· {taskLabel}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", lineHeight: 1.4 }}>{finding.title}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0, marginTop: 2 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${s.border}` }}>
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: "10px 0" }}>{finding.summary}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Sources:</span>
            {finding.citations.length > 0 ? (
              finding.citations.map((citation) => (
                <button
                  key={citation.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCitation(citation);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: activeCitationId === citation.id ? "#dbeafe" : "#eff6ff",
                    border: `1px solid ${activeCitationId === citation.id ? "#93c5fd" : "#bfdbfe"}`,
                    color: activeCitationId === citation.id ? "#1d4ed8" : "#3b82f6",
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: "pointer",
                    lineHeight: 1.5,
                    boxShadow: activeCitationId === citation.id ? "0 0 0 2px #bfdbfe" : "none",
                  }}
                >
                  {citation.sh}
                </button>
              ))
            ) : (
              <span style={{ fontSize: 10, color: "#b0bec5" }}>No citation emitted</span>
            )}
            {finding.citations.length > 0 && <span style={{ fontSize: 10, color: "#b0bec5" }}>click to inspect</span>}
          </div>
        </div>
      )}
    </div>
  );
}
