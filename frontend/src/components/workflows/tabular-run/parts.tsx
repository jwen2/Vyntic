import { ddTheme } from "@/components/dd/types";
import { RED } from "../theme";
import type { Theme } from "./useTabularRun";

// Small presentational primitives shared across the tabular-run subcomponents.

export function SectionLabel({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: c.t3,
      }}
    >
      {children}
    </div>
  );
}

export function RetryIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? "dd-spin" : undefined}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4v6h6M20 20v-6h-6M5.07 9A8 8 0 0119.93 9M18.93 15A8 8 0 014.07 15" />
    </svg>
  );
}

export function SummaryCards({
  theme,
  documents,
  completeCells,
  totalCells,
  highRiskCount,
  elapsedLabel,
  runId,
}: {
  theme: Theme;
  documents: number;
  completeCells: number;
  totalCells: number;
  highRiskCount: number;
  elapsedLabel: string;
  runId: string;
}) {
  const c = ddTheme(theme);
  // Quiet inline metadata rather than a row of boxed tiles — the run's numbers
  // are context, not the point of the screen.
  const items: { value: string; label: string; color?: string; mono?: boolean }[] = [
    { value: String(documents), label: `document${documents === 1 ? "" : "s"}` },
    { value: `${completeCells}/${totalCells}`, label: "cells" },
    { value: String(highRiskCount), label: "high risk", color: highRiskCount > 0 ? RED : undefined },
    { value: elapsedLabel || "0s", label: "elapsed" },
    { value: runId.slice(0, 8), label: "run id", mono: true },
  ];
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
        fontSize: 12.5,
        color: c.t3,
      }}
    >
      {items.map((item, i) => (
        <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span style={{ opacity: 0.55 }}>·</span>}
          <span>
            <span
              style={{
                color: item.color || c.t1,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                fontFamily: item.mono
                  ? "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
                  : "inherit",
              }}
            >
              {item.value}
            </span>{" "}
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}
