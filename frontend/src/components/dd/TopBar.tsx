
import type React from "react";
import type { Deal } from "@/lib/api";
import { stageBadge } from "@/lib/stageBadges";
import { ACCENT, ddTheme } from "./types";

export type DealWorkspaceMode = "agent" | "workflows" | "brief";

interface TopBarProps {
  deal: Deal;
  mode: DealWorkspaceMode;
  onMode: (mode: DealWorkspaceMode) => void;
  dealBreakers: number;
  documentCount: number;
  onOpenDocuments: () => void;
  onOpenPosition?: () => void;
  onOpenManager?: () => void;
  onBack: () => void;
  onOpenSidebar?: () => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

export default function TopBar({
  deal,
  mode,
  onMode,
  dealBreakers,
  documentCount,
  onOpenDocuments,
  onOpenPosition,
  onOpenManager,
  onBack,
  onOpenSidebar,
  onToggleTheme,
  theme,
}: TopBarProps) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const surface = isDark ? "rgba(17,17,17,0.94)" : "rgba(243,243,238,0.94)";
  const chip = isDark ? "#1a1a1a" : "rgba(255,255,255,0.78)";

  return (
    <div
      className="flex-shrink-0 border-b px-3 py-3 sm:px-5"
      style={{
        background: surface,
        borderBottomColor: c.border,
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {onOpenSidebar && mode === "agent" && (
          <div className="lg:hidden">
            <IconButton title="Open chat history" onClick={onOpenSidebar} theme={theme}>
              ≡
            </IconButton>
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          title="Back to deals"
          className="flex items-center gap-3"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              background: isDark ? "#f5f5f5" : "#111111",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isDark ? "#111111" : "white",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            V
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ color: c.t1, fontWeight: 600, fontSize: 14 }}>Vyntic</div>
            <div
              className="font-mono-plex"
              style={{
                color: c.t3,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Deal workspace
            </div>
          </div>
        </button>

        <span style={{ color: c.t3, fontSize: 13 }}>›</span>
        <span style={{ color: c.t2, fontSize: 13, fontWeight: 500 }}>Deals</span>

        <div style={{ flex: 1 }} />

        <div className="hidden items-center gap-2 md:flex">
          <StatPill
            label="Documents"
            value={documentCount}
            chip={chip}
            border={c.border}
            text={c.t1}
            muted={c.t3}
          />
          {dealBreakers > 0 && (
            <div
              className="flex items-center"
              style={{
                gap: 6,
                padding: "7px 12px",
                borderRadius: 999,
                background: isDark ? "#2a1212" : "#fff4f3",
                border: `1px solid ${isDark ? "#4b1919" : "#f0c2bd"}`,
              }}
            >
              <span
                className="dd-pulse"
                style={{ width: 7, height: 7, borderRadius: "50%", background: "#d14334" }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#f0b3ad" : "#9a2e23" }}>
                {dealBreakers} risk{dealBreakers === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          title="Manage documents"
          onClick={onOpenDocuments}
          className="flex items-center"
          style={{
            gap: 7,
            padding: "9px 12px",
            background: chip,
            color: c.t1,
            border: `1px solid ${c.border}`,
            borderRadius: 999,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <span>{documentCount} docs</span>
        </button>

        {deal.entity_type === "fund" && onOpenPosition && (
          <button
            type="button"
            title="View LP position"
            onClick={onOpenPosition}
            className="flex items-center"
            style={{
              gap: 7,
              padding: "9px 12px",
              background: c.accentTint,
              color: c.accentStrong,
              border: `1px solid ${c.accentTintBorder}`,
              borderRadius: 999,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Position
          </button>
        )}

        <IconButton
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={onToggleTheme}
          theme={theme}
        >
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

      <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-end sm:justify-between">
        <div style={{ minWidth: 0 }}>
          <div
            className="font-mono-plex flex items-center gap-1"
            style={{
              color: c.t3,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {deal.entity_type === "fund" && deal.manager_name && onOpenManager ? (
              <><button type="button" onClick={onOpenManager} style={{ background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer", textTransform: "inherit", letterSpacing: "inherit" }}>{deal.manager_name}</button><span>› Fund</span></>
            ) : deal.entity_type === "fund" ? "Active fund" : "Active deal"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                lineHeight: 1.15,
                fontWeight: 600,
                color: c.t1,
              }}
            >
              {deal.name}
            </h1>
            {deal.entity_type === "fund" && deal.vintage && (
              <span
                className="font-mono-plex"
                style={{
                  fontSize: 10,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: chip,
                  color: c.t2,
                  border: `1px solid ${c.border}`,
                  whiteSpace: "nowrap",
                  letterSpacing: "0.12em",
                }}
              >
                {deal.vintage}
              </span>
            )}
            {(() => {
              // Same hued stage chip as the home deal list, so a stage keeps
              // its color when the deal opens in the workspace. Unknown stages
              // fall back to the neutral chip.
              const badge = stageBadge(deal.stage, isDark);
              return (
                <span
                  className="font-mono-plex"
                  style={{
                    fontSize: 10,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: badge ? badge.bg : chip,
                    color: badge ? badge.fg : c.t2,
                    border: `1px solid ${badge ? badge.border : c.border}`,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  {deal.stage}
                </span>
              );
            })()}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="md:hidden">
            {dealBreakers > 0 && (
              <div
                className="flex items-center"
                style={{
                  gap: 6,
                  padding: "7px 12px",
                  borderRadius: 999,
                  background: isDark ? "#2a1212" : "#fff4f3",
                  border: `1px solid ${isDark ? "#4b1919" : "#f0c2bd"}`,
                }}
              >
                <span
                  className="dd-pulse"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#d14334" }}
                />
                <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#f0b3ad" : "#9a2e23" }}>
                  {dealBreakers} risk{dealBreakers === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
          <ModeSegmentedControl mode={mode} onMode={onMode} theme={theme} />
        </div>
      </div>
    </div>
  );
}

function ModeSegmentedControl({
  mode,
  onMode,
  theme,
}: {
  mode: DealWorkspaceMode;
  onMode: (mode: DealWorkspaceMode) => void;
  theme: "light" | "dark";
}) {
  const c = ddTheme(theme);
  const items: Array<{ key: DealWorkspaceMode; label: string; icon: React.ReactNode }> = [
    {
      key: "agent",
      label: "Agent",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      ),
    },
    {
      key: "workflows",
      label: "Workflows",
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
        </svg>
      ),
    },
    {
      key: "brief",
      label: "Brief",
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h6" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="flex w-full sm:w-auto"
      style={{
        background: theme === "dark" ? "#111111" : "rgba(255,255,255,0.7)",
        border: `1px solid ${c.border}`,
        borderRadius: 999,
        padding: 3,
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onMode(item.key)}
          className="flex flex-1 items-center justify-center sm:flex-none"
          style={{
            gap: 6,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            background: mode === item.key ? ACCENT : "transparent",
            color: mode === item.key ? "var(--on-accent)" : c.t2,
            border: "none",
            borderRadius: 999,
            cursor: "pointer",
            transition: "all .15s",
            minWidth: 0,
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
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
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark ? "#1a1a1a" : "rgba(255,255,255,0.78)",
        color: isDark ? "rgba(255,255,255,0.68)" : "var(--landing-muted)",
        border: `1px solid ${isDark ? "#2d2d2d" : "var(--landing-border)"}`,
        borderRadius: 999,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function StatPill({
  label,
  value,
  chip,
  border,
  text,
  muted,
}: {
  label: string;
  value: number;
  chip: string;
  border: string;
  text: string;
  muted: string;
}) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        background: chip,
        border: `1px solid ${border}`,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: muted,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: text }}>{value}</div>
    </div>
  );
}
