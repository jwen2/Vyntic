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

// Semantic theming tokens live entirely in index.css (`:root` for light,
// `.dark` for dark; values contrast-checked there) and are consumed through the
// Tailwind color aliases in tailwind.config.js (bg-surface, text-t1,
// border-edge, …). The old inline-style token shim that used to live here was
// retired in FE5.6, once the brief components stopped calling it.
