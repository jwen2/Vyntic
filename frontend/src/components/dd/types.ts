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
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    dot: "#ef4444",
    textDark: "#fca5a5",
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

export const ACCENT = "#111111";

export const DD_DARK = {
  bg: "#0f0f0f",
  surface: "#171717",
  surfaceAlt: "#111111",
  border: "#2a2a2a",
  borderLight: "#202020",
  t1: "#f5f5f5",
  t2: "rgba(255,255,255,0.68)",
  t3: "rgba(255,255,255,0.45)",
  t4: "#303030",
};

export const DD_LIGHT = {
  bg: "var(--landing-bg)",
  surface: "var(--landing-surface)",
  surfaceAlt: "var(--landing-surface-alt)",
  border: "var(--landing-border)",
  borderLight: "#e5e5dc",
  t1: "var(--landing-text)",
  t2: "var(--landing-muted)",
  t3: "#8a8a80",
  t4: "#c8c8bd",
};

export function ddTheme(theme: "light" | "dark") {
  return theme === "dark" ? DD_DARK : DD_LIGHT;
}
