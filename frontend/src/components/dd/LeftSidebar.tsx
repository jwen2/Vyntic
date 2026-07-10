
import { useState } from "react";
import type React from "react";
import type { ConversationEntry } from "@/lib/api";
import { ACCENT, ddTheme, tint } from "./types";

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
  onClose?: () => void;
}

export default function LeftSidebar({
  assistantHistory,
  assistantHistoryLoaded,
  activeAssistantEntryId,
  theme,
  onNewAssistantChat,
  onSelectAssistantHistory,
  onClose,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  return (
    <aside
      className="dd-scroll flex h-full min-h-0 flex-col overflow-hidden"
      style={{
        width: 320,
        flexShrink: 0,
        background: c.surface,
        borderRight: `1px solid ${c.border}`,
      }}
    >
      <div className="border-b px-4 py-4" style={{ borderBottomColor: c.border }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="font-mono-plex"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: c.t3,
              }}
            >
              Agent workspace
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color: c.t1 }}>Chats</div>
            <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.6, color: c.t2 }}>
              Resume prior investigations or start a new thread for this deal.
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border lg:hidden"
              style={{
                borderColor: c.border,
                color: c.t1,
                background: c.surfaceAlt,
              }}
              aria-label="Close chat history"
            >
              ×
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onNewAssistantChat}
            className="flex items-center justify-center"
            style={{
              flex: 1,
              gap: 8,
              padding: "11px 14px",
              borderRadius: 999,
              border: "none",
              background: ACCENT,
              color: "var(--on-accent)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
              <path d="M12 8v6" />
              <path d="M9 11h6" />
            </svg>
            New chat
          </button>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${c.border}`,
              background: c.surfaceAlt,
            }}
          >
            <div
              className="font-mono-plex"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: c.t3,
              }}
            >
              Saved
            </div>
            <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: c.t1 }}>{assistantHistory.length}</div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setHistoryCollapsed((v) => !v)}
            className="flex items-center"
            style={{
              gap: 6,
              border: "none",
              background: "transparent",
              padding: 0,
              color: c.t2,
              cursor: "pointer",
            }}
          >
            <SectionLabel color={c.t3} marginBottom={0}>Agent history</SectionLabel>
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
          <span style={{ fontSize: 10, fontWeight: 650, color: c.t3, padding: "3px 8px", background: c.surfaceAlt, borderRadius: 999 }}>
            {assistantHistory.length}
          </span>
        </div>

        {!historyCollapsed && (
          <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {!assistantHistoryLoaded ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "2px 0" }}>
                {[52, 75, 63, 46].map((width, index) => (
                  <div key={index} style={{
                    height: 58,
                    borderRadius: 16,
                    background: isDark ? "#1e1e1e" : "#e4e4da",
                    opacity: 0.65,
                    width: `${Math.max(width, 88)}%`,
                  }} />
                ))}
              </div>
            ) : assistantHistory.length === 0 ? (
              <div
                style={{
                  padding: "20px 16px",
                  fontSize: 13,
                  color: c.t2,
                  lineHeight: 1.6,
                  background: c.surfaceAlt,
                  border: `1px solid ${c.border}`,
                  borderRadius: 20,
                }}
              >
                No chats yet. Start a thread to ask questions across the deal room.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

        <div
          className="mt-4 border-t pt-4"
          style={{
            borderTopColor: c.border,
          }}
        >
          <div
            className="font-mono-plex"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: c.t3,
            }}
          >
            Review mode
          </div>
          <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.65, color: c.t2 }}>
            Every answer stays tied to source citations so the deal team can verify before sharing.
          </div>
        </div>
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
  const bg = active ? (isDark ? "#1d1d1d" : "#ffffff") : "transparent";
  const title = entry.question.replace(/^Focus on these document\(s\):[\s\S]+?\n\n/, "").trim() || "Untitled chat";
  return (
    <button
      type="button"
      title={title}
      onClick={() => onSelect(entry)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDark ? "#1d1d1d" : "#ffffff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = bg;
      }}
      style={{
        width: "100%",
        display: "block",
        padding: "12px 12px",
        background: bg,
        border: `1px solid ${active ? tint(ACCENT, 20) : c.border}`,
        borderRadius: 18,
        cursor: "pointer",
        textAlign: "left",
        transition: "background .1s, border-color .1s",
        boxShadow: active ? (isDark ? "0 12px 24px rgba(0,0,0,0.18)" : "0 12px 24px rgba(17,17,17,0.06)") : "none",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            background: active ? ACCENT : c.surfaceAlt,
            color: active ? "var(--on-accent)" : c.t2,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: c.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
          <span style={{ display: "block", marginTop: 3, fontSize: 10, color: c.t3 }}>
            {formatSessionDate(entry.created_at)}
          </span>
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, color: c.t3, fontSize: 10 }}>
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
