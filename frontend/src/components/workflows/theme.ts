/**
 * Workflow-feature theme additions.
 * Reuses the semantic CSS-var tokens; adds the violet accent for tabular workflows
 * and a few helpers for type-tag styling.
 */
import type { WorkflowType } from "@/lib/workflows";

// The second semantic hue (tabular workflows, derived citations, KV cells).
// Reads the themed token — flips to a light violet in dark mode like --accent,
// so any *fill* using VIOLET must pair text with var(--on-violet).
export const VIOLET = "var(--violet)";
export const ACCENT = "var(--accent)";
// Amber and green fold onto the shared status scale so workflow severity uses
// the same three colours as findings, coverage and confidence. Both were raw
// hex before the reskin and were among the workspace's off-palette hits.
export const AMBER = "var(--status-warning)";
export const GREEN = "var(--status-good)";
// RED resolves to the shared --danger token (burnt-orange in light, soft coral
// in dark) so workflow error/risk surfaces share one red with the danger
// <Button>. tint(RED, n) still works: tint() uses color-mix, which accepts
// var() strings. Solid fills that overlay light text must use --danger-tint +
// --danger (a light-coral fill can't carry white text in dark mode).
export const RED = "var(--danger)";

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
