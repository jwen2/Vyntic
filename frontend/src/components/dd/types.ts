import type { Citation } from "@/lib/api";

export type FindingSeverity = "deal-breaker" | "material" | "noteworthy";
export type FindingStatus = null | "validated" | "rejected" | "review";
export type FindingOrigin = null | "scan";

/**
 * Legacy DD workstream identifier — kept as a string so old findings persisted
 * in localStorage continue to deserialize after the Workstreams tab was
 * retired in PR #80. New findings emitted by the Proactive Scan workflow
 * (future work) should leave this empty or set a sensible category tag.
 */
export type LegacyWorkstreamId = string;

export interface Finding {
  id: string;
  sev: FindingSeverity;
  title: string;
  detail: string;
  /** Human-readable source, e.g. "QoE Report · p.23" */
  src: string;
  ws: LegacyWorkstreamId;
  /** Linked DD question query (matches Workstream template.query), or null */
  qid: string | null;
  /** 0–100 confidence */
  conf: number;
  status: FindingStatus;
  note: string | null;
  origin: FindingOrigin;
  /** Best source citation for opening the document viewer directly. */
  sourceCitation?: Citation | null;
  /** @deprecated — was the agent investigation id; kept on the type to avoid breaking persisted findings. */
  producerId?: string | null;
}

export interface DocCoverage {
  id: string;
  /** Full filename */
  name: string;
  /** Short display name */
  short: string;
  pages: number;
  cited: number;
  flags: number;
  uncovered?: boolean;
}

export const SEV_COLOR: Record<
  FindingSeverity,
  { label: string; color: string; bg: string; border: string; dot: string; textDark: string }
> = {
  "deal-breaker": {
    label: "Deal-Breaker",
    color: "var(--status-critical)",
    bg: "var(--status-critical-tint)",
    border: "var(--status-critical-tint-border)",
    dot: "var(--status-critical)",
    textDark: "var(--status-critical)",
  },
  material: {
    label: "Material",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
    dot: "#f59e0b",
    textDark: "#fde68a",
  },
  noteworthy: {
    label: "Noteworthy",
    color: "#404040",
    bg: "#f5f5f5",
    border: "#d4d4d4",
    dot: "#737373",
    textDark: "#d4d4d4",
  },
};

export const ACCENT = "var(--accent)";

/** Alpha wash via color-mix — works on hex AND var() strings (8-digit hex can't). */
export function tint(color: string, alphaPct: number): string {
  return `color-mix(in srgb, ${color} ${alphaPct}%, transparent)`;
}

// Semantic theming tokens as CSS-variable references — the single source of
// truth now lives in index.css (`:root` for light, `.dark` for dark; values
// contrast-checked there). This collapses the old dual DD_LIGHT/DD_DARK maps
// (FE11): the tokens are theme-independent var() refs that flip via the .dark
// class, so consumers no longer branch on `theme` for color.
const DD_TOKENS = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surfaceAlt: "var(--surface-alt)",
  border: "var(--border)",
  borderLight: "var(--border-light)",
  t1: "var(--text-1)",
  t2: "var(--text-2)",
  t3: "var(--text-3)",
  t4: "var(--text-4)",
  // Data-grid separation: zebra = alternating body row; gridHeader = the
  // column-header fill (a second scanning channel beyond the 1px gridline).
  zebra: "var(--zebra)",
  gridHeader: "var(--grid-header)",
  accent: "var(--accent)",
  accentStrong: "var(--accent-strong)",
  accentTint: "var(--accent-tint)",
  accentTintBorder: "var(--accent-tint-border)",
  onAccent: "var(--on-accent)",
};

/** @deprecated The light/dark split moved to CSS vars — this is now identical
 * to DD_DARK and to what ddTheme() returns. Kept as an alias for any lingering
 * importers. */
export const DD_LIGHT = DD_TOKENS;
/** @deprecated see DD_LIGHT. */
export const DD_DARK = DD_TOKENS;

/**
 * Returns the semantic token map (CSS-var refs). The `theme` argument no longer
 * affects the result — colors flip via the `.dark` class — but the signature is
 * kept so the ~96 existing `ddTheme(theme)` call sites need no change.
 */
export function ddTheme(_theme?: "light" | "dark") {
  return DD_TOKENS;
}
