"use client";

import { useState } from "react";
import type React from "react";
import type { ConversationEntry } from "@/lib/api";
import { ACCENT, ddTheme } from "./types";

// LeftSidebar is now agent-only — the Workstreams tab (and its Documents +
// Coverage sidebar block) was retired in PR #80. The sidebar still gates on
// `mode === "agent"` in page.tsx; Brief and Workflows render edge-to-edge
// without a sidebar.

interface Props {
  assistantHistory: ConversationEntry[];
  assistantHistoryLoaded: boolean;
  activeAssistantEntryId: string | null;
  theme: "light" | "dark";
  onNewAssistantChat: () => void;
  onSelectAssistantHistory: (entry: ConversationEntry) => void;
}

export default function LeftSidebar({
  assistantHistory,
  assistantHistoryLoaded,
  activeAssistantEntryId,
  theme,
  onNewAssistantChat,
  onSelectAssistantHistory,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

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
            onClick={onNewAssistantChat}
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
          onClick={onNewAssistantChat}
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
            onClick={() => setHistoryCollapsed((v) => !v)}
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
              style={{ transform: historyCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .12s" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <span style={{ fontSize: 10, fontWeight: 650, color: c.t3, padding: "1px 6px", background: c.surface, borderRadius: 99 }}>
            {assistantHistory.length}
          </span>
        </div>

        {!historyCollapsed && (
          <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {!assistantHistoryLoaded ? (
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
            ) : assistantHistory.length === 0 ? (
              <div style={{ padding: "8px", fontSize: 12, color: c.t3, lineHeight: 1.45 }}>
                No chats yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {assistantHistory.map((entry) => (
                  <AssistantHistoryRow
                    key={entry.id}
                    entry={entry}
                    active={entry.id === activeAssistantEntryId}
                    theme={theme}
                    onSelect={onSelectAssistantHistory}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
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
