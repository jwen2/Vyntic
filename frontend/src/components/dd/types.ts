import type { WorkstreamId } from "@/lib/queryTemplates";
import type { Citation } from "@/lib/api";

export type FindingSeverity = "deal-breaker" | "material" | "noteworthy";
export type FindingStatus = null | "validated" | "rejected" | "review";
export type FindingOrigin = null | "agent" | "scan";

export interface Finding {
  id: string;
  sev: FindingSeverity;
  title: string;
  detail: string;
  /** Human-readable source, e.g. "QoE Report · p.23" */
  src: string;
  ws: WorkstreamId;
  /** Linked DD question query (matches Workstream template.query), or null */
  qid: string | null;
  /** 0–100 confidence */
  conf: number;
  status: FindingStatus;
  note: string | null;
  origin: FindingOrigin;
  /** Best source citation for opening the document viewer directly. */
  sourceCitation?: Citation | null;
  /** Producer id, e.g. persisted agent investigation id. */
  producerId?: string | null;
}

export interface AgentPlanTask {
  id: string;
  label: string;
  docs: string[];
  /** "1m 10s" format */
  eta: string;
}

export type AgentPhase = "prompt" | "plan" | "running" | "done";

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
    color: "#1d4ed8",
    bg: "#eff6ff",
    border: "#bfdbfe",
    dot: "#3b82f6",
    textDark: "#93c5fd",
  },
};

export const ACCENT = "#2563eb";

export const DD_DARK = {
  bg: "#0f172a",
  surface: "#1e293b",
  surfaceAlt: "#0b1120",
  border: "#334155",
  borderLight: "#1e293b",
  t1: "#f1f5f9",
  t2: "#94a3b8",
  t3: "#475569",
  t4: "#334155",
};

export const DD_LIGHT = {
  bg: "#f8fafc",
  surface: "#ffffff",
  surfaceAlt: "#f1f5f9",
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  t1: "#0f172a",
  t2: "#64748b",
  t3: "#94a3b8",
  t4: "#cbd5e1",
};

export function ddTheme(theme: "light" | "dark") {
  return theme === "dark" ? DD_DARK : DD_LIGHT;
}
