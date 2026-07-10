/**
 * Workflow-feature theme additions.
 * Reuses ddTheme tokens; adds the violet accent for tabular workflows
 * and a few helpers for type-tag styling.
 */
import type { WorkflowType } from "@/lib/workflows";

// The second semantic hue (tabular workflows, derived citations, KV cells).
// Reads the themed token — flips to a light violet in dark mode like --accent,
// so any *fill* using VIOLET must pair text with var(--on-violet).
export const VIOLET = "var(--violet)";
export const ACCENT = "var(--accent)";
export const AMBER = "#f59e0b";
export const GREEN = "#22c55e";
export const RED = "#ef4444";

export { tint } from "@/components/dd/types";

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
