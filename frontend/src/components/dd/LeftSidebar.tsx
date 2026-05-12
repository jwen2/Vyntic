"use client";

import { useState } from "react";
import type React from "react";
import type { ConversationEntry } from "@/lib/api";
import type { Finding, DocCoverage, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";

interface Props {
  // "agent" hosts the assistant-chat experience.
  mode: "agent" | "workstreams";
  findings: Finding[];
  docs: DocCoverage[];
  assistantHistory: ConversationEntry[];
  assistantHistoryLoaded: boolean;
  activeAssistantEntryId: string | null;
  activeWs: string | null;
  activeDocId: string | null;
  theme: "light" | "dark";
  onNewAssistantChat: () => void;
  onSelectAssistantHistory: (entry: ConversationEntry) => void;
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
  assistantHistory,
  assistantHistoryLoaded,
  activeAssistantEntryId,
  activeWs,
  activeDocId,
  theme,
  onNewAssistantChat,
  onSelectAssistantHistory,
  onSelectDocument,
  onDeleteDocument,
  onSelectFinding,
  onOpenSource,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [assistantHistoryCollapsed, setAssistantHistoryCollapsed] = useState(false);
  const totalPages = docs.reduce((sum, doc) => sum + doc.pages, 0);
  const citedPages = docs.reduce((sum, doc) => sum + doc.cited, 0);
  const coveragePct = totalPages > 0 ? Math.round((citedPages / totalPages) * 100) : 0;

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
      {mode === "agent" ? (
        <AssistantSidebarContent
          history={assistantHistory}
          historyLoaded={assistantHistoryLoaded}
          activeEntryId={activeAssistantEntryId}
          collapsed={assistantHistoryCollapsed}
          theme={theme}
          onToggleCollapsed={() => setAssistantHistoryCollapsed((value) => !value)}
          onNewChat={onNewAssistantChat}
          onSelectEntry={onSelectAssistantHistory}
        />
      ) : (
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
          No findings yet. Run a Proactive Scan to surface deal-breakers.
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
        </>
      )}
    </aside>
  );
}

function AssistantSidebarContent({
  history,
  historyLoaded,
  activeEntryId,
  collapsed,
  theme,
  onToggleCollapsed,
  onNewChat,
  onSelectEntry,
}: {
  history: ConversationEntry[];
  historyLoaded: boolean;
  activeEntryId: string | null;
  collapsed: boolean;
  theme: "light" | "dark";
  onToggleCollapsed: () => void;
  onNewChat: () => void;
  onSelectEntry: (entry: ConversationEntry) => void;
}) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: ACCENT,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 800,
          }}>
            V
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: c.t1 }}>Agent</span>
        </div>
        <button
          type="button"
          title="New chat"
          aria-label="New chat"
          onClick={onNewChat}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.t2,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center"
        style={{
          width: "100%",
          gap: 8,
          padding: "9px 10px",
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: c.t1,
          fontSize: 13,
          fontWeight: 650,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          <path d="M12 8v6" />
          <path d="M9 11h6" />
        </svg>
        New chat
      </button>

      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center"
          style={{
            gap: 6,
            border: "none",
            background: "transparent",
            padding: 0,
            color: c.t3,
            cursor: "pointer",
          }}
        >
          <SectionLabel color={c.t3} marginBottom={0}>Agent History</SectionLabel>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .12s" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <span style={{ fontSize: 10, fontWeight: 650, color: c.t3, padding: "1px 6px", background: c.surface, borderRadius: 99 }}>
          {history.length}
        </span>
      </div>

      {!collapsed && (
        <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {!historyLoaded ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 0" }}>
              {[52, 75, 63, 46].map((width, index) => (
                <div key={index} style={{
                  height: 34,
                  borderRadius: 7,
                  background: isDark ? "#1e293b" : "#e2e8f0",
                  opacity: 0.65,
                  width: `${width}%`,
                }} />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: "8px", fontSize: 12, color: c.t3, lineHeight: 1.45 }}>
              No chats yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.map((entry) => (
                <AssistantHistoryRow
                  key={entry.id}
                  entry={entry}
                  active={entry.id === activeEntryId}
                  theme={theme}
                  onSelect={onSelectEntry}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantHistoryRow({
  entry,
  active,
  theme,
  onSelect,
}: {
  entry: ConversationEntry;
  active: boolean;
  theme: "light" | "dark";
  onSelect: (entry: ConversationEntry) => void;
}) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const bg = active ? (isDark ? "#1e293b" : "#ffffff") : "transparent";
  const title = entry.question.replace(/^Focus on these document\(s\):[\s\S]+?\n\n/, "").trim() || "Untitled chat";
  return (
    <button
      type="button"
      title={title}
      onClick={() => onSelect(entry)}
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
      <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? ACCENT : c.t3} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: c.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, color: c.t3, fontSize: 10 }}>
        <span>{formatSessionDate(entry.created_at)}</span>
        <span>{entry.citations.filter(Boolean).length} source{entry.citations.filter(Boolean).length === 1 ? "" : "s"}</span>
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
