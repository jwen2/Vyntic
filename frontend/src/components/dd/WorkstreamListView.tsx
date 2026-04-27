"use client";

import type { Workstream, WorkstreamId } from "@/lib/queryTemplates";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import type { Finding, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";
import DealBriefDashboard from "./DealBriefDashboard";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;

interface Props {
  workstreams: Workstream[];
  resultCache: WorkstreamCache;
  findings: Finding[];
  theme: "light" | "dark";
  onSelect: (workstreamId: WorkstreamId) => void;
  onSelectFinding: (finding: Finding) => void;
}

const WORKSTREAM_ORDER: WorkstreamId[] = ["proactive_scan", "financial", "commercial", "operational", "legal"];

export default function WorkstreamListView({ workstreams, resultCache, findings, theme, onSelect, onSelectFinding }: Props) {
  const c = ddTheme(theme);
  const displayWorkstreams = WORKSTREAM_ORDER
    .map((id) => workstreams.find((workstream) => workstream.id === id))
    .filter((workstream): workstream is Workstream => Boolean(workstream));

  return (
    <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: c.bg }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: c.t1, marginBottom: 4 }}>Workstreams</h2>
        <p style={{ fontSize: 13, color: c.t2 }}>Run the proactive scan once, then drill into focused diligence tracks</p>
      </div>

      <DealBriefDashboard
        workstreams={workstreams}
        resultCache={resultCache}
        findings={findings}
        theme={theme}
        onOpenProactiveScan={() => onSelect("proactive_scan")}
        onSelectFinding={onSelectFinding}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {displayWorkstreams.map((workstream) => {
          const cached = resultCache[workstream.id] || {};
          const completed = workstream.templates.filter((template) => cached[template.query]?.status === "complete").length;
          const total = workstream.templates.length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const wsFindings = findings.filter((finding) => finding.ws === workstream.id);
          const highest = highestSeverity(wsFindings);
          const notStarted = completed === 0;
          const isScan = workstream.id === "proactive_scan";

          return (
            <button
              key={workstream.id}
              onClick={() => onSelect(workstream.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${ACCENT}55`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = c.border;
                e.currentTarget.style.transform = "none";
              }}
              className="flex items-center"
              style={{
                gap: 14,
                width: "100%",
                padding: "14px 16px",
                background: isScan && completed > 0 ? (theme === "dark" ? "#111827" : "#fffbeb") : c.surface,
                border: `1px solid ${isScan && completed > 0 ? "#f59e0b66" : c.border}`,
                borderRadius: 10,
                cursor: "pointer",
                transition: "all .12s",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>{workstream.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: c.t1 }}>{workstream.name}</span>
                  {wsFindings.length > 0 && highest && (
                    <FlagBadge count={wsFindings.length} severity={highest} theme={theme} />
                  )}
                  {isScan && completed > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: theme === "dark" ? "#fcd34d" : "#b45309",
                        padding: "1px 6px",
                        borderRadius: 99,
                        background: theme === "dark" ? "#78350f" : "#fef3c7",
                        border: `1px solid ${theme === "dark" ? "#92400e" : "#fde68a"}`,
                      }}
                    >
                      SAVED
                    </span>
                  )}
                  {workstream.id === "legal" && notStarted && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: theme === "dark" ? "#fca5a5" : "#dc2626",
                        padding: "1px 6px",
                        borderRadius: 99,
                        background: theme === "dark" ? "#7f1d1d" : "#fef2f2",
                        border: `1px solid ${theme === "dark" ? "#7f1d1d" : "#fecaca"}`,
                      }}
                    >
                      NOT ANALYZED
                    </span>
                  )}
                </span>
                <span style={{ display: "block", fontSize: 12, color: c.t3, marginBottom: 6 }}>
                  {workstream.description}
                </span>
                <span className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ flex: 1, maxWidth: 200, height: 3, borderRadius: 99, background: c.border, overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${pct}%`, height: "100%", background: completed > 0 ? ACCENT : "transparent", borderRadius: 99 }} />
                  </span>
                  <span className="font-mono-dm" style={{ fontSize: 10, color: c.t3 }}>{completed}/{total}</span>
                </span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.t3} strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlagBadge({ count, severity, theme }: { count: number; severity: FindingSeverity; theme: "light" | "dark" }) {
  const meta = SEV_COLOR[severity];
  return (
    <span
      className="flex items-center"
      style={{
        gap: 3,
        fontSize: 10,
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: 99,
        background: theme === "dark" ? `${meta.dot}22` : meta.bg,
        color: theme === "dark" ? meta.textDark : meta.color,
        border: `1px solid ${theme === "dark" ? `${meta.dot}44` : meta.border}`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot }} />
      {count} flag{count > 1 ? "s" : ""}
    </span>
  );
}

function highestSeverity(findings: Finding[]): FindingSeverity | null {
  if (findings.some((finding) => finding.sev === "deal-breaker")) return "deal-breaker";
  if (findings.some((finding) => finding.sev === "material")) return "material";
  if (findings.some((finding) => finding.sev === "noteworthy")) return "noteworthy";
  return null;
}
