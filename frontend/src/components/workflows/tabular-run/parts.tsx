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
  const cards = [
    { label: "Documents", value: String(documents) },
    { label: "Cells Extracted", value: `${completeCells}/${totalCells}` },
    { label: "High Risk", value: String(highRiskCount), color: highRiskCount > 0 ? RED : c.t1 },
    { label: "Run Time", value: elapsedLabel || "0s" },
    { label: "Run ID", value: runId.slice(0, 8), mono: true },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            minWidth: 104,
            padding: "8px 12px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 9, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, fontWeight: 700 }}>
            {card.label}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: card.color || c.t1,
              fontFamily: card.mono ? "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" : "inherit",
            }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
