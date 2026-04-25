"use client";

import type { Workstream, WorkstreamId } from "@/lib/queryTemplates";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import type { Finding, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;

interface Props {
  workstreams: Workstream[];
  resultCache: WorkstreamCache;
  findings: Finding[];
  theme: "light" | "dark";
  onSelect: (workstreamId: WorkstreamId) => void;
}

const RISK_DIMENSIONS: Array<{ dim: string; ws: WorkstreamId; keywords: string[] }> = [
  { dim: "Revenue Quality", ws: "financial", keywords: ["revenue", "qoe", "quality"] },
  { dim: "Customer Concentration", ws: "commercial", keywords: ["customer", "concentration"] },
  { dim: "Management Depth", ws: "operational", keywords: ["management", "key person", "cto"] },
  { dim: "Margin Sustainability", ws: "financial", keywords: ["margin", "ebitda"] },
  { dim: "Regulatory Exposure", ws: "legal", keywords: ["regulatory", "compliance"] },
  { dim: "Litigation", ws: "legal", keywords: ["litigation", "claim", "lawsuit"] },
  { dim: "Capital Intensity", ws: "financial", keywords: ["capex", "capital", "cash flow"] },
  { dim: "Technology Risk", ws: "operational", keywords: ["technology", "systems", "ip"] },
];

const WORKSTREAM_ORDER: WorkstreamId[] = ["proactive_scan", "financial", "commercial", "operational", "legal"];

export default function WorkstreamListView({ workstreams, resultCache, findings, theme, onSelect }: Props) {
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

      <RiskScorecardSummary findings={findings} theme={theme} />

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

function RiskScorecardSummary({ findings, theme }: { findings: Finding[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  const scores = RISK_DIMENSIONS.map((dimension) => {
    const relevant = findings.filter((finding) => {
      const haystack = `${finding.title} ${finding.detail}`.toLowerCase();
      return finding.ws === dimension.ws || dimension.keywords.some((keyword) => haystack.includes(keyword));
    });
    return { ...dimension, score: scoreFindings(relevant) };
  });
  const avg = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
  const overallColor = scoreColor(avg);
  const overallLabel = avg >= 4 ? "High" : avg >= 3 ? "Medium-High" : avg >= 2 ? "Medium" : "Low";

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 16 }}>🚦</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.t1 }}>Risk Scorecard</span>
        <div style={{ flex: 1 }} />
        <div className="flex items-center" style={{ gap: 6, padding: "3px 10px", borderRadius: 99, background: `${overallColor}18`, border: `1px solid ${overallColor}44` }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: overallColor }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: overallColor }}>{overallLabel} Risk</span>
          <span className="font-mono-dm" style={{ fontSize: 10, color: overallColor }}>{avg.toFixed(1)}/5</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        {scores.map((risk) => {
          const color = scoreColor(risk.score);
          return (
            <div key={risk.dim} style={{ padding: "8px 10px", borderRadius: 6, background: theme === "dark" ? "#0f172a" : "#f8fafc", border: `1px solid ${c.borderLight}` }}>
              <div style={{ fontSize: 11, color: c.t2, marginBottom: 5, lineHeight: 1.3 }}>{risk.dim}</div>
              <div className="flex items-center" style={{ gap: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 99, background: c.border, overflow: "hidden" }}>
                  <div style={{ width: `${(risk.score / 5) * 100}%`, height: "100%", borderRadius: 99, background: color }} />
                </div>
                <span className="font-mono-dm" style={{ fontSize: 10, fontWeight: 700, color }}>{risk.score}</span>
              </div>
              <div style={{ fontSize: 9, color, fontWeight: 600, marginTop: 3 }}>{scoreLabel(risk.score)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: c.t3, marginTop: 10 }}>
        Scores derived from findings across all workstreams · Run more workstreams to improve accuracy
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

function scoreFindings(findings: Finding[]): number {
  if (findings.some((finding) => finding.sev === "deal-breaker")) return 5;
  const material = findings.filter((finding) => finding.sev === "material").length;
  const noteworthy = findings.filter((finding) => finding.sev === "noteworthy").length;
  if (material >= 2) return 4;
  if (material === 1) return 3;
  if (noteworthy >= 2) return 2;
  return 1;
}

function scoreColor(score: number) {
  if (score >= 4) return "#ef4444";
  if (score >= 3) return "#f59e0b";
  if (score >= 2) return "#3b82f6";
  return "#22c55e";
}

function scoreLabel(score: number) {
  if (score >= 4) return "High";
  if (score >= 3) return "Med";
  if (score >= 2) return "Low";
  return "Min";
}
