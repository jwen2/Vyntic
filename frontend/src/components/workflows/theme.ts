/**
 * Workflow-feature theme additions.
 * Reuses ddTheme tokens; adds the violet accent for tabular workflows
 * and a few helpers for type-tag styling.
 */
import type { WorkflowType } from "@/lib/workflows";

export const VIOLET = "#5f5f57";
export const ACCENT = "#111111";
export const AMBER = "#f59e0b";
export const GREEN = "#22c55e";
export const RED = "#ef4444";

/** With opacity suffix in 8-digit hex (browser-supported in Chrome/Safari/FF) */
export function tint(hex: string, alphaPct: number): string {
  const a = Math.round((alphaPct / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function workflowTypeColor(type: WorkflowType): string {
  return type === "assistant" ? ACCENT : VIOLET;
}

export function workflowTypeLabel(
  type: WorkflowType,
  stagesCount: number,
  columnsCount: number
): string {
  if (type === "assistant") {
    return `Assistant · ${stagesCount} stage${stagesCount === 1 ? "" : "s"}`;
  }
  return `Tabular · ${columnsCount} col${columnsCount === 1 ? "" : "s"}`;
}

export function workflowTypeIcon(type: WorkflowType): string {
  return type === "assistant" ? "📝" : "⊞";
}

export function formatRelativeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "Today";
  return date.toLocaleString("en-US", { month: "short", day: "numeric" });
}
