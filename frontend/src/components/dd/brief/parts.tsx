// Small shared presentational pieces for the brief: pills, badges, stat
// cards and the line-clamp helper. Extracted from DealBriefDashboard.tsx (FE5.4).

import { useEffect, useState, type CSSProperties } from "react";
import { type Citation } from "@/lib/api";
import { ACCENT, SEV_COLOR, ddTheme, type FindingSeverity } from "../types";
import { formatRelativeTime } from "./diff";

export function lineClamp(lineCount: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lineCount,
    overflow: "hidden",
  };
}

export function BriefStatCard({
  label,
  value,
  detail,
  theme,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  theme: "light" | "dark";
  tone?: "default" | "alert";
}) {
  const c = ddTheme(theme);
  const isAlert = tone === "alert";

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 20,
        border: `1px solid ${isAlert ? "var(--status-critical-tint-border)" : c.border}`,
        background: isAlert ? "var(--status-critical-tint)" : c.surfaceAlt,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isAlert ? "var(--status-critical)" : c.t3,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 24, lineHeight: 1, fontWeight: 600, color: c.t1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: c.t2 }}>{detail}</div>
    </div>
  );
}

export function OverrideBadge({ theme }: { theme: "light" | "dark" }) {
  return (
    <span
      title="Analyst override"
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: theme === "dark" ? "#fcd34d" : "#b45309",
        background: theme === "dark" ? "#78350f55" : "#fef3c7",
        border: `1px solid ${theme === "dark" ? "#92400e" : "#fde68a"}`,
        borderRadius: 999,
        padding: "2px 6px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      ✎ override
    </span>
  );
}

export function SourceChip({ citation, index, onClick }: { citation?: Citation | null; index: number; onClick?: () => void }) {
  const interactive = Boolean(onClick);
  const label = citation ? `p.${citation.page}` : `[${index}]`;
  return (
    <button
      type="button"
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      disabled={!interactive}
      title={citation ? `${citation.source_file} — Page ${citation.page}` : `Source ${index}`}
      style={{
        marginLeft: 4,
        padding: "2px 6px",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--on-accent)",
        background: ACCENT,
        border: "none",
        borderRadius: 999,
        cursor: interactive ? "pointer" : "default",
        verticalAlign: "baseline",
        lineHeight: 1.25,
      }}
    >
      {label}
    </button>
  );
}

export function FreshnessPill({ at, theme }: { at: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      title={new Date(at).toLocaleString()}
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: c.t2,
        padding: "5px 9px",
        borderRadius: 99,
        background: c.surfaceAlt,
        border: `1px solid ${c.border}`,
      }}
    >
      Last scan {formatRelativeTime(at)}
    </span>
  );
}

export function DiffPill({ count, onClick, active }: { count: number; theme: "light" | "dark"; onClick: () => void; active: boolean }) {
  const accent = active ? "#2a2a2a" : "#111111";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "white",
        padding: "2px 8px",
        borderRadius: 99,
        background: accent,
        border: "none",
        cursor: "pointer",
      }}
    >
      {count} change{count === 1 ? "" : "s"}
    </button>
  );
}

export function StatusPill({ completed, total, loading, theme }: { completed: number; total: number; loading: boolean; theme: "light" | "dark" }) {
  const done = total > 0 && completed === total;
  const color = loading ? "#111111" : done ? "#16a34a" : "#f59e0b";
  const label = loading ? "Scanning" : done ? "Complete" : completed > 0 ? `${completed}/${total} complete` : "Not run";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color,
        padding: "5px 9px",
        borderRadius: 99,
        background: theme === "dark" ? `${color}22` : `${color}14`,
        border: `1px solid ${color}44`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

export function SourcePill({ count, theme }: { count: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <span style={{ fontSize: 11, color: c.t2, padding: "6px 10px", borderRadius: 99, background: c.surfaceAlt, border: `1px solid ${c.border}` }}>
      {count} source{count === 1 ? "" : "s"}
    </span>
  );
}

export function CountBadge({ label, count, theme }: { label: string; count: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.t2, padding: "5px 8px", borderRadius: 99, border: `1px solid ${c.border}`, background: c.surfaceAlt }}>
      {count} {label}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: FindingSeverity }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV_COLOR[severity].dot, flexShrink: 0 }} />;
}

export function BulletList({ items, theme }: { items: string[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
      {items.map((item, idx) => (
        <li key={`${item}-${idx}`} className="flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12, color: c.t1, lineHeight: 1.4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT, marginTop: 6, flexShrink: 0 }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Placeholder({ text, theme }: { text: string; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div style={{ height: "100%", minHeight: 92, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: c.t3, textAlign: "center" }}>
      {text}
    </div>
  );
}
