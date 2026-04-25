"use client";

import type { InvestigationSummary } from "@/lib/api";
import type { AgentDoc } from "./types";

interface Props {
  history: InvestigationSummary[];
  docs: AgentDoc[];
  selectedRun: string | null;
  onSelectRun: (id: string) => void;
}

function formatRunTime(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function AgentLeftSidebar({ history, docs, selectedRun, onSelectRun }: Props) {
  const totalPages = docs.reduce((sum, doc) => sum + doc.pages, 0);

  return (
    <div style={{
      width: 256,
      flexShrink: 0,
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      borderRight: "1px solid #1e293b",
      overflow: "hidden",
    }}>
      <div style={{ padding: "14px 14px 8px", borderBottom: "1px solid #1e293b" }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 10,
        }}>
          Recent Runs
        </div>
        {history.slice(0, 5).map((run) => (
          <button
            key={run.id}
            onClick={() => onSelectRun(run.id)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1e293b";
              e.currentTarget.style.borderColor = "#334155";
            }}
            onMouseLeave={(e) => {
              if (selectedRun !== run.id) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              marginBottom: 3,
              background: selectedRun === run.id ? "#1e293b" : "transparent",
              border: `1px solid ${selectedRun === run.id ? "#334155" : "transparent"}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <div style={{
              fontSize: 12,
              color: "#e2e8f0",
              fontWeight: 500,
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {run.goal || "General diligence investigation"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatRunTime(run.created_at)}
              </span>
              <span style={{
                fontSize: 10,
                color: "#64748b",
                padding: "1px 5px",
                borderRadius: 3,
                background: "#1e293b",
                whiteSpace: "nowrap",
              }}>
                {run.finding_count} findings
              </span>
            </div>
          </button>
        ))}
        {history.length === 0 && (
          <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, padding: "6px 2px 8px" }}>
            No completed agent runs yet.
          </div>
        )}
      </div>

      <div style={{ padding: "12px 14px", flex: 1, overflowY: "auto" }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 10,
        }}>
          Deal Room
        </div>
        {docs.map((doc) => (
          <div key={doc.id} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            marginBottom: 2,
            borderRadius: 5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: doc.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.short}
            </span>
            <span className="font-mono-dm" style={{ fontSize: 10, color: "#475569" }}>
              {doc.pages}p
            </span>
          </div>
        ))}

        <div style={{ margin: "12px 0 6px", padding: 10, background: "#1e293b", borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>Total document scope</div>
          <div className="font-mono-dm" style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
            {totalPages} pages
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>
            across {docs.length} document{docs.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
