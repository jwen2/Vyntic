"use client";

import type React from "react";
import type { InvestigationSummary } from "@/lib/api";
import type { Finding, DocCoverage, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";

interface Props {
  mode: "agent" | "workstreams";
  findings: Finding[];
  docs: DocCoverage[];
  sessions: InvestigationSummary[];
  activeSessionId: string | null;
  activeWs: string | null;
  activeDocId: string | null;
  theme: "light" | "dark";
  onSelectSession: (sessionId: string) => void;
  onSelectDocument: (docId: string | null) => void;
  onDeleteDocument?: (doc: DocCoverage) => void;
  onSelectFinding: (f: Finding) => void;
  onOpenSource: (f: Finding) => void;
}

const SEVERITY_ORDER: Array<{ sev: FindingSeverity; label: string }> = [
  { sev: "deal-breaker", label: "Deal-Breaker" },
  { sev: "material", label: "Material" },
  { sev: "noteworthy", label: "Noteworthy" },
];

export default function LeftSidebar({
  mode,
  findings,
  docs,
  sessions,
  activeSessionId,
  activeWs,
  activeDocId,
  theme,
  onSelectSession,
  onSelectDocument,
  onDeleteDocument,
  onSelectFinding,
  onOpenSource,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const totalPages = docs.reduce((sum, doc) => sum + doc.pages, 0);
  const citedPages = docs.reduce((sum, doc) => sum + doc.cited, 0);
  const coveragePct = totalPages > 0 ? Math.round((citedPages / totalPages) * 100) : 0;
  const visibleSessions = [...sessions]
    .sort((a, b) => sessionTime(b) - sessionTime(a))
    .slice(0, 5);
  const hiddenSessionCount = Math.max(0, sessions.length - visibleSessions.length);

  return (
    <aside
      className="dd-scroll"
      style={{
        width: 272,
        flexShrink: 0,
        background: c.surfaceAlt,
        borderRight: `1px solid ${c.border}`,
        overflowY: "auto",
        padding: 14,
      }}
    >
      {mode === "workstreams" ? (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <SectionLabel color={c.t3} marginBottom={0}>Documents</SectionLabel>
            {docs.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: c.t3, padding: "1px 6px", background: c.surface, borderRadius: 99 }}>
                {docs.length}
              </span>
            )}
          </div>

          {docs.length === 0 ? (
            <div style={{ padding: "8px", fontSize: 12, color: c.t3, lineHeight: 1.45 }}>
              No documents in this deal yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {docs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  active={doc.id === activeDocId}
                  theme={theme}
                  onSelect={onSelectDocument}
                  onDelete={onDeleteDocument}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <SectionLabel color={c.t3} marginBottom={0}>Agent Sessions</SectionLabel>
            {sessions.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: c.t3, padding: "1px 6px", background: c.surface, borderRadius: 99 }}>
                {visibleSessions.length}/{sessions.length}
              </span>
            )}
          </div>

          {sessions.length === 0 ? (
            <div style={{ padding: "8px", fontSize: 12, color: c.t3, lineHeight: 1.45 }}>
              No saved sessions yet. Start with the AI agent to create a persisted thread.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {visibleSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  theme={theme}
                  onSelect={onSelectSession}
                />
              ))}
              {hiddenSessionCount > 0 && (
                <div style={{ padding: "3px 8px", fontSize: 10, color: c.t3 }}>
                  {hiddenSessionCount} older session{hiddenSessionCount > 1 ? "s" : ""} hidden
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div
        style={{
          margin: "10px 0 16px",
          padding: 10,
          background: c.surface,
          borderRadius: 8,
          border: `1px solid ${c.border}`,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: c.t3 }}>Coverage</span>
          <span className="font-mono-dm" style={{ fontSize: 11, fontWeight: 700, color: c.t1 }}>{coveragePct}%</span>
        </div>
        <div style={{ height: 3, borderRadius: 99, background: c.border, overflow: "hidden" }}>
          <div style={{ width: `${coveragePct}%`, height: "100%", background: ACCENT, borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 10, color: c.t3, marginTop: 4 }}>
          {citedPages} of {totalPages} pages cited
        </div>
      </div>

      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <SectionLabel color={c.t3} marginBottom={0}>Findings</SectionLabel>
        <span style={{ fontSize: 10, fontWeight: 600, color: c.t3, padding: "1px 6px", background: c.surface, borderRadius: 99 }}>
          {findings.length}
        </span>
      </div>

      {findings.length === 0 && (
        <div style={{ padding: "8px", fontSize: 12, color: c.t3, lineHeight: 1.45 }}>
          No findings yet. Ask the agent to scan the deal room.
        </div>
      )}

      {SEVERITY_ORDER.map(({ sev, label }) => {
        const items = findings.filter((finding) => finding.sev === sev);
        if (items.length === 0) return null;
        const meta = SEV_COLOR[sev];
        const sevText = isDark ? meta.textDark : meta.color;
        return (
          <div key={sev} style={{ marginBottom: 12 }}>
            <div className="flex items-center" style={{ gap: 5, marginBottom: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: sevText, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </span>
              <span style={{ fontSize: 10, color: c.t3, fontWeight: 600 }}>{items.length}</span>
            </div>
            {items.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                active={finding.ws === activeWs}
                theme={theme}
                onSelect={onSelectFinding}
                onOpenSource={onOpenSource}
              />
            ))}
          </div>
        );
      })}
    </aside>
  );
}

function SessionRow({
  session,
  active,
  theme,
  onSelect,
}: {
  session: InvestigationSummary;
  active: boolean;
  theme: "light" | "dark";
  onSelect: (sessionId: string) => void;
}) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const date = formatSessionDate(session.updated_at || session.created_at);
  const statusColor = session.status === "complete" ? "#22c55e" : session.status === "error" ? "#ef4444" : "#f59e0b";
  const bg = active ? (isDark ? "#1e293b" : "#ffffff") : "transparent";

  return (
    <button
      type="button"
      title={session.goal || "Agent session"}
      onClick={() => onSelect(session.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDark ? c.surface : "#ffffff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = bg;
      }}
      style={{
        width: "100%",
        display: "block",
        padding: "8px 9px",
        background: bg,
        border: `1px solid ${active ? `${ACCENT}55` : "transparent"}`,
        borderRadius: 7,
        cursor: "pointer",
        textAlign: "left",
        transition: "background .1s, border-color .1s",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: c.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.goal || "General diligence investigation"}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, color: c.t3, fontSize: 10 }}>
        <span>{date}</span>
        <span className="font-mono-dm">{session.finding_count} flags</span>
        {session.followup_count > 0 && <span className="font-mono-dm">{session.followup_count} replies</span>}
      </span>
    </button>
  );
}

function DocRow({
  doc,
  active,
  theme,
  onSelect,
  onDelete,
}: {
  doc: DocCoverage;
  active: boolean;
  theme: "light" | "dark";
  onSelect: (docId: string | null) => void;
  onDelete?: (doc: DocCoverage) => void;
}) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const pct = doc.pages > 0 ? Math.round((doc.cited / doc.pages) * 100) : 0;
  const barColor = doc.uncovered ? "#ef4444" : pct > 50 ? "#22c55e" : pct > 0 ? "#f59e0b" : c.border;
  const pctColor = doc.uncovered ? "#ef4444" : pct > 50 ? "#16a34a" : pct > 0 ? "#b45309" : c.t3;
  const baseBg = active ? (isDark ? "#1e293b" : "#ffffff") : "transparent";

  return (
    <div
      role="button"
      tabIndex={0}
      title={doc.name}
      onClick={() => onSelect(active ? null : doc.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(active ? null : doc.id);
        }
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDark ? c.surface : "#ffffff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBg;
      }}
      style={{
        width: "100%",
        display: "block",
        padding: "8px 9px",
        background: baseBg,
        border: `1px solid ${active ? `${ACCENT}55` : "transparent"}`,
        borderRadius: 7,
        cursor: "pointer",
        textAlign: "left",
        transition: "background .1s, border-color .1s",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: c.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.short}
        </span>
        {onDelete && (
          <button
            type="button"
            title={`Delete ${doc.name}`}
            aria-label={`Delete ${doc.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc);
            }}
            style={{
              width: 20,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${isDark ? "#7f1d1d55" : "#fecaca"}`,
              borderRadius: 5,
              background: isDark ? "#7f1d1d22" : "#fff1f2",
              color: isDark ? "#fca5a5" : "#dc2626",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v5" />
              <path d="M14 11v5" />
            </svg>
          </button>
        )}
        <span className="font-mono-dm" style={{ fontSize: 10, fontWeight: 700, color: pctColor }}>
          {pct}%
        </span>
      </span>
      <span style={{ display: "block", height: 3, borderRadius: 99, background: c.border, overflow: "hidden", marginBottom: 5 }}>
        <span style={{ display: "block", width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99 }} />
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, color: c.t3, fontSize: 10 }}>
        <span className="font-mono-dm">{doc.cited}/{doc.pages} pgs</span>
        {doc.uncovered && (
          <span style={{ color: "#ef4444", fontWeight: 700, letterSpacing: "0.04em" }}>NOT ANALYZED</span>
        )}
        {doc.flags > 0 && (
          <span style={{ color: isDark ? "#fca5a5" : "#b91c1c", fontWeight: 600 }}>
            {doc.flags} flag{doc.flags > 1 ? "s" : ""}
          </span>
        )}
      </span>
    </div>
  );
}

function FindingRow({
  finding,
  active,
  theme,
  onSelect,
  onOpenSource,
}: {
  finding: Finding;
  active: boolean;
  theme: "light" | "dark";
  onSelect: (finding: Finding) => void;
  onOpenSource: (finding: Finding) => void;
}) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const meta = SEV_COLOR[finding.sev];
  const isDealBreaker = finding.sev === "deal-breaker";
  const dealBreakerPreview = finding.detail.length > 120 ? `${finding.detail.slice(0, 117)}...` : finding.detail;
  const baseBg =
    isDealBreaker
      ? isDark ? "rgba(127,29,29,.2)" : "#fef2f2"
      : active
      ? isDark ? "#1e293b" : "#ffffff"
      : "transparent";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(finding)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(finding);
        }
      }}
      onMouseEnter={(e) => {
        if (isDealBreaker) e.currentTarget.style.background = isDark ? "rgba(127,29,29,.3)" : "#fee2e2";
        else e.currentTarget.style.background = isDark ? c.surface : "#ffffff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBg;
      }}
      className="flex items-start"
      style={{
        width: "100%",
        gap: 8,
        padding: 8,
        borderRadius: 6,
        marginBottom: 3,
        cursor: "pointer",
        background: baseBg,
        border: isDealBreaker ? `1px solid ${isDark ? "#7f1d1d" : "#fecaca"}` : "none",
        borderLeft: isDealBreaker ? `3px solid ${meta.dot}` : "none",
        textAlign: "left",
        transition: "background .1s",
      }}
    >
      <span style={{ width: isDealBreaker ? 8 : 7, height: isDealBreaker ? 8 : 7, borderRadius: "50%", background: meta.dot, flexShrink: 0, marginTop: isDealBreaker ? 5 : 4 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {isDealBreaker && (
          <span style={{ display: "inline-block", marginBottom: 3, padding: "1px 5px", borderRadius: 99, background: isDark ? "#7f1d1d" : "#fee2e2", color: isDark ? "#fecaca" : "#b91c1c", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Deal breaker
          </span>
        )}
        <span
          style={{
            display: "block",
            fontSize: isDealBreaker ? 13 : 12,
            fontWeight: isDealBreaker ? 800 : 500,
            color: isDealBreaker ? (isDark ? "#fecaca" : "#991b1b") : c.t1,
            lineHeight: 1.35,
          }}
        >
          {finding.title}
        </span>
        {isDealBreaker && dealBreakerPreview && (
          <span style={{ display: "block", fontSize: 11, color: isDark ? "#fca5a5" : "#7f1d1d", marginTop: 3, lineHeight: 1.35 }}>
            {dealBreakerPreview}
          </span>
        )}
        <span
          role={finding.sourceCitation ? "button" : undefined}
          title={finding.sourceCitation ? "Open source evidence" : undefined}
          onClick={(e) => {
            if (!finding.sourceCitation) return;
            e.stopPropagation();
            onOpenSource(finding);
          }}
          onMouseEnter={(e) => {
            if (finding.sourceCitation) e.currentTarget.style.color = "#60a5fa";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = c.t3;
          }}
          style={{
            display: "block",
            fontSize: 10,
            color: c.t3,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textDecoration: finding.sourceCitation ? "underline" : "none",
            textUnderlineOffset: 2,
            cursor: finding.sourceCitation ? "pointer" : "inherit",
          }}
        >
          {finding.src}
        </span>
      </span>
    </div>
  );
}

function formatSessionDate(raw: string | null): string {
  if (!raw) return "Saved";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "Saved";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sessionTime(session: InvestigationSummary): number {
  const raw = session.updated_at || session.created_at;
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function SectionLabel({
  children,
  color,
  marginBottom = 8,
}: {
  children: React.ReactNode;
  color: string;
  marginBottom?: number;
}) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom }}>
      {children}
    </div>
  );
}
