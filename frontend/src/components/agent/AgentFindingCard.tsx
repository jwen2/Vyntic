"use client";

import { useState } from "react";
import { ACCENT, ddTheme } from "@/components/dd/types";
import { useTheme } from "@/components/ThemeProvider";
import type { AgentLocalCitation, AgentLocalFinding, AgentTask } from "./types";
import { SEV } from "./types";

interface Props {
  finding: AgentLocalFinding;
  index: number;
  tasks: AgentTask[];
  activeCitationId: string | null;
  onCitation: (citation: AgentLocalCitation) => void;
  focused?: boolean;
}

function SevBadge({ sev }: { sev: AgentLocalFinding["sev"] }) {
  const { theme } = useTheme();
  const s = SEV[sev];
  const darkBg = `${s.dot}22`;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "1px 6px",
      borderRadius: 99,
      background: theme === "dark" ? darkBg : s.bg,
      border: `1px solid ${theme === "dark" ? `${s.dot}44` : s.border}`,
      fontSize: 10,
      fontWeight: 700,
      color: theme === "dark" ? (sev === "deal-breaker" ? "#fca5a5" : sev === "material" ? "#fde68a" : "#93c5fd") : s.color,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />
      {s.label}
    </span>
  );
}

export default function AgentFindingCard({ finding, index, tasks, activeCitationId, onCitation, focused = false }: Props) {
  const { theme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [open, setOpen] = useState(true);
  const s = SEV[finding.sev];
  const taskLabel = tasks.find((task) => task.id === finding.taskId)?.label || "Agent task";

  return (
    <div className="fade-up" style={{
      animationDelay: `${index * 0.05}s`,
      background: c.surface,
      border: `1px solid ${focused ? ACCENT : isDark ? `${s.dot}44` : s.border}`,
      boxShadow: focused ? `0 0 0 3px ${ACCENT}22` : "none",
      borderRadius: 10,
      overflow: "hidden",
      borderLeft: `3px solid ${s.dot}`,
      transition: "border-color .2s, box-shadow .2s",
    }}>
      <div
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark ? "#243247" : "#fafafa";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = c.surface;
        }}
        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", cursor: "pointer" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <SevBadge sev={finding.sev} />
            <span style={{ fontSize: 10, color: c.t3 }}>· {taskLabel}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.t1, lineHeight: 1.4 }}>{finding.title}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.t3} strokeWidth="2" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0, marginTop: 2 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${isDark ? `${s.dot}33` : s.border}` }}>
          <p style={{ fontSize: 13, color: c.t2, lineHeight: 1.7, margin: "10px 0" }}>{finding.summary}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: c.t3, fontWeight: 500 }}>Sources:</span>
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
                    background: activeCitationId === citation.id ? (isDark ? "#1e3a8a66" : "#dbeafe") : (isDark ? "#1e3a8a33" : "#eff6ff"),
                    border: `1px solid ${activeCitationId === citation.id ? "#93c5fd" : isDark ? "#3b82f644" : "#bfdbfe"}`,
                    color: isDark ? "#93c5fd" : activeCitationId === citation.id ? "#1d4ed8" : "#3b82f6",
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: "pointer",
                    lineHeight: 1.5,
                    boxShadow: activeCitationId === citation.id ? `0 0 0 2px ${isDark ? "#1e3a8a" : "#bfdbfe"}` : "none",
                  }}
                >
                  {citation.sh}
                </button>
              ))
            ) : (
              <span style={{ fontSize: 10, color: c.t3 }}>No citation emitted</span>
            )}
            {finding.citations.length > 0 && <span style={{ fontSize: 10, color: c.t3 }}>click to inspect</span>}
          </div>
        </div>
      )}
    </div>
  );
}
