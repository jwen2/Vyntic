import type React from "react";
import type { Deal } from "@/lib/api";
import { stageBadge } from "@/lib/stageBadges";

export type DealWorkspaceMode = "agent" | "workflows" | "brief" | "monitoring";

interface TopBarProps {
  deal: Deal;
  dealBreakers: number;
  onOpenPosition?: () => void;
  onOpenManager?: () => void;
  onOpenSidebar?: () => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

// Slim deal-context bar that sits atop the main column (the rail carries nav).
export default function TopBar({
  deal,
  dealBreakers,
  onOpenPosition,
  onOpenManager,
  onOpenSidebar,
  onToggleTheme,
  theme,
}: TopBarProps) {
  const isDark = theme === "dark";
  const chip = isDark ? "#1a1a1a" : "rgba(255,255,255,0.78)";
  const badge = stageBadge(deal.stage, isDark);

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-b-edge bg-surface px-4 py-3">
      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge bg-surface-alt text-t1 lg:hidden"
          aria-label="Open menu"
        >
          ≡
        </button>
      )}

      <div style={{ minWidth: 0 }}>
        <div
          className="font-mono-plex flex items-center gap-1 text-t3"
          style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}
        >
          {deal.entity_type === "fund" && deal.manager_name && onOpenManager ? (
            <>
              <button
                type="button"
                onClick={onOpenManager}
                style={{ background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer", textTransform: "inherit", letterSpacing: "inherit" }}
              >
                {deal.manager_name}
              </button>
              <span>› Fund</span>
            </>
          ) : deal.entity_type === "fund" ? (
            "Active fund"
          ) : (
            "Active deal"
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2" style={{ minWidth: 0 }}>
          <h1 className="text-t1" style={{ margin: 0, fontSize: 18, lineHeight: 1.2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {deal.name}
          </h1>
          <span
            className="font-mono-plex"
            style={{ flexShrink: 0, fontSize: 10, letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 7, background: "var(--accent-tint)", color: "var(--accent)", border: "1px solid var(--accent-tint-border)" }}
          >
            {deal.deal_id}
          </span>
          {deal.entity_type === "fund" && deal.vintage && (
            <span className="font-mono-plex" style={{ flexShrink: 0, fontSize: 10, padding: "3px 8px", borderRadius: 7, background: chip, color: "var(--text-2)", border: "1px solid var(--border)", letterSpacing: "0.1em" }}>
              {deal.vintage}
            </span>
          )}
          {badge && (
            <span className="font-mono-plex" style={{ flexShrink: 0, fontSize: 10, padding: "3px 8px", borderRadius: 7, background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {deal.stage}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {dealBreakers > 0 && (
        <div
          className="hidden items-center sm:flex"
          style={{ gap: 6, padding: "6px 11px", borderRadius: 8, background: "var(--status-critical-tint)", border: `1px solid var(--status-critical-tint-border)` }}
        >
          <span className="dd-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-critical)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-critical)" }}>
            {dealBreakers} risk{dealBreakers === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {deal.entity_type === "fund" && onOpenPosition && (
        <button
          type="button"
          onClick={onOpenPosition}
          className="rounded-lg bg-accent-tint text-accent-strong border border-accent-tint-border"
          style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
        >
          Position
        </button>
      )}

      <IconButton title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme} theme={theme}>
        {isDark ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </IconButton>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  theme,
  children,
}: {
  title: string;
  onClick: () => void;
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark ? "#1a1a1a" : "rgba(255,255,255,0.78)",
        color: isDark ? "rgba(255,255,255,0.68)" : "var(--landing-muted)",
        border: `1px solid ${isDark ? "#2d2d2d" : "var(--landing-border)"}`,
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
