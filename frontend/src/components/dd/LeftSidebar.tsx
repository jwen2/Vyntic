import { type ReactNode } from "react";
import type { ConversationEntry, Deal } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ACCENT, ddTheme, tint } from "./types";
import type { DealWorkspaceMode } from "./TopBar";
import Button from "@/components/ui/Button";

// The deal-workspace rail: brand → New chat → nav → Recent → user. Persistent
// across all modes; nav drives mode switching (Documents opens the modal).

interface Props {
  deal: Deal;
  mode: DealWorkspaceMode;
  onMode: (mode: DealWorkspaceMode) => void;
  onOpenDocuments: () => void;
  onBack: () => void;
  assistantHistory: ConversationEntry[];
  assistantHistoryLoaded: boolean;
  activeAssistantEntryId: string | null;
  theme: "light" | "dark";
  onNewAssistantChat: () => void;
  onSelectAssistantHistory: (entry: ConversationEntry) => void;
  onClose?: () => void;
}

function icon(path: ReactNode) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

export default function LeftSidebar({
  deal,
  mode,
  onMode,
  onOpenDocuments,
  onBack,
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
  const { user } = useAuth();
  const displayName = user?.full_name || user?.email || "Account";
  const initials =
    displayName
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const navItems: { label: string; node: ReactNode; onClick: () => void; active: boolean }[] = [
    { label: "Agent", node: icon(<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />), onClick: () => onMode("agent"), active: mode === "agent" },
    { label: "Workflows", node: icon(<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />), onClick: () => onMode("workflows"), active: mode === "workflows" },
    { label: "Brief", node: icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>), onClick: () => onMode("brief"), active: mode === "brief" },
    ...(deal.entity_type === "fund"
      ? [{ label: "Monitoring", node: icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />), onClick: () => onMode("monitoring"), active: mode === "monitoring" }]
      : []),
    { label: "Documents", node: icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>), onClick: onOpenDocuments, active: false },
  ];

  return (
    <aside
      className="dd-scroll flex h-full min-h-0 flex-col overflow-hidden"
      style={{ width: 264, flexShrink: 0, background: c.surface, borderRight: `1px solid ${c.border}` }}
    >
      {/* Brand + back */}
      <div className="border-b px-3 pt-3 pb-3" style={{ borderBottomColor: c.border }}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-mono-plex"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.t3 }}
          >
            ‹ All deals
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border lg:hidden"
              style={{ borderColor: c.border, color: c.t1, background: c.surfaceAlt }}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <div style={{ width: 30, height: 30, borderRadius: 8, background: c.t1, color: c.surface, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>V</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: c.t1 }}>Vyntic</div>
            <div className="font-mono-plex" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: c.t3 }}>Deal workspace</div>
          </div>
        </div>
      </div>

      {/* New chat + nav */}
      <div className="px-3 pt-3">
        <Button
          variant="tint"
          fullWidth
          onClick={onNewAssistantChat}
          iconLeft={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          }
        >
          New chat
        </Button>

        <nav className="mt-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="flex items-center"
              style={{
                gap: 10,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 9,
                border: `1px solid ${item.active ? c.border : "transparent"}`,
                background: item.active ? c.surfaceAlt : "transparent",
                color: item.active ? c.t1 : c.t2,
                fontSize: 13.5,
                fontWeight: item.active ? 500 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {item.node}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Recent history */}
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
        <div className="font-mono-plex" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: c.t3, padding: "0 4px 8px" }}>
          Recent
        </div>
        <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {!assistantHistoryLoaded ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "2px 0" }}>
              {[52, 75, 63].map((width, index) => (
                <div key={index} style={{ height: 40, borderRadius: 10, background: isDark ? "#1e1e1e" : "#e4e4da", opacity: 0.65, width: `${Math.max(width, 88)}%` }} />
              ))}
            </div>
          ) : assistantHistory.length === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 12.5, color: c.t3, lineHeight: 1.6 }}>
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
      </div>

      {/* User */}
      <div className="flex items-center gap-2.5 border-t px-4 py-3" style={{ borderTopColor: c.border }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent-tint)", border: "1px solid var(--accent-tint-border)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {initials}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
          {user?.email && user?.full_name && (
            <div style={{ fontSize: 11, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
          )}
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
      aria-label={`Open saved chat: ${title}`}
      aria-current={active ? "true" : undefined}
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
        padding: "8px 10px",
        background: bg,
        border: `1px solid ${active ? tint(ACCENT, 20) : "transparent"}`,
        borderRadius: 9,
        cursor: "pointer",
        textAlign: "left",
        transition: "background .1s, border-color .1s",
      }}
    >
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: c.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </span>
      <span style={{ display: "block", marginTop: 2, fontSize: 10, color: c.t3 }}>
        {formatSessionDate(entry.created_at)} · {entry.citations.filter(Boolean).length} source{entry.citations.filter(Boolean).length === 1 ? "" : "s"}
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
