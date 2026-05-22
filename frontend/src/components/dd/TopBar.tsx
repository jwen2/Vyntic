"use client";

import type React from "react";
import type { Deal } from "@/lib/api";
import { ACCENT, ddTheme } from "./types";

export type DealWorkspaceMode = "agent" | "workflows" | "brief";

interface TopBarProps {
  deal: Deal;
  mode: DealWorkspaceMode;
  onMode: (mode: DealWorkspaceMode) => void;
  dealBreakers: number;
  onBack: () => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

export default function TopBar({
  deal,
  mode,
  onMode,
  dealBreakers,
  onBack,
  onToggleTheme,
  theme,
}: TopBarProps) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";

  return (
    <div
      className="flex items-center flex-shrink-0"
      style={{
        height: 48,
        padding: "0 16px",
        gap: 10,
        background: isDark ? "#0f172a" : "#ffffff",
        borderBottom: `1px solid ${c.border}`,
      }}
    >
      <button
        onClick={onBack}
        title="Back to deals"
        className="flex items-center gap-2"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            background: ACCENT,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          V
        </div>
        <span style={{ color: c.t1, fontWeight: 600, fontSize: 14 }}>Vyntic</span>
      </button>

      <span style={{ color: c.t4, fontSize: 13 }}>›</span>
      <span style={{ fontSize: 13, color: c.t2, fontWeight: 500 }}>{deal.name}</span>
      <span
        style={{
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 99,
          background: c.surface,
          color: c.t3,
          border: `1px solid ${c.border}`,
          whiteSpace: "nowrap",
        }}
      >
        {deal.stage}
      </span>

      <div style={{ flex: 1 }} />

      <ModeSegmentedControl mode={mode} onMode={onMode} theme={theme} />

      <div style={{ width: 1, height: 20, background: c.border }} />

      {dealBreakers > 0 && (
        <div
          className="flex items-center"
          style={{
            gap: 5,
            padding: "3px 9px",
            borderRadius: 6,
            background: isDark ? "#450a0a" : "#fef2f2",
            border: `1px solid ${isDark ? "#7f1d1d" : "#fecaca"}`,
          }}
        >
          <span className="dd-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#fca5a5" : "#dc2626", whiteSpace: "nowrap" }}>
            {dealBreakers} Deal-Breaker{dealBreakers > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <button
        title={theme === "dark" ? "Light mode" : "Dark mode"}
        onClick={onToggleTheme}
        style={{
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          color: c.t3,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
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
      </button>

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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
        </svg>
      ),
    },
    {
      key: "brief",
      label: "Brief",
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      className="flex"
      style={{
        background: c.surfaceAlt,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: 2,
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onMode(item.key)}
          className="flex items-center"
          style={{
            gap: 6,
            padding: "5px 14px",
            fontSize: 12,
            fontWeight: 600,
            background: mode === item.key ? ACCENT : "transparent",
            color: mode === item.key ? "white" : c.t2,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            transition: "all .15s",
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
