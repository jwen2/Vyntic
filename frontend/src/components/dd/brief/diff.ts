// Scan-to-scan field diffing, analyst-override merging, and freshness
// formatting. Extracted verbatim from DealBriefDashboard.tsx (FE5.2).

import type { BriefField } from "./config";

export interface FieldDiff {
  panel: "snapshot" | "transaction";
  panelLabel: string;
  label: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
}

export interface BriefDiffSnapshot {
  changes: FieldDiff[];
  at: number;
  previousAt?: number;
}

export function diffPanel(
  panel: "snapshot" | "transaction",
  panelLabel: string,
  before: BriefField[],
  after: BriefField[]
): FieldDiff[] {
  const beforeMap = new Map(before.map((f) => [f.label.toLowerCase(), f]));
  const afterMap = new Map(after.map((f) => [f.label.toLowerCase(), f]));
  const changes: FieldDiff[] = [];

  for (const [key, afterField] of Array.from(afterMap.entries())) {
    const beforeField = beforeMap.get(key);
    if (!beforeField) {
      if (!isNotFound(afterField.value)) {
        changes.push({ panel, panelLabel, label: afterField.label, before: "", after: afterField.value, kind: "added" });
      }
      continue;
    }
    if (afterField.override || beforeField.override) continue; // analyst-controlled fields don't count as scan changes
    if (normalizeForCompare(beforeField.value) !== normalizeForCompare(afterField.value)) {
      const beforeNF = isNotFound(beforeField.value);
      const afterNF = isNotFound(afterField.value);
      if (beforeNF && afterNF) continue;
      if (beforeNF) changes.push({ panel, panelLabel, label: afterField.label, before: "", after: afterField.value, kind: "added" });
      else if (afterNF) changes.push({ panel, panelLabel, label: afterField.label, before: beforeField.value, after: "", kind: "removed" });
      else changes.push({ panel, panelLabel, label: afterField.label, before: beforeField.value, after: afterField.value, kind: "changed" });
    }
  }
  for (const [key, beforeField] of Array.from(beforeMap.entries())) {
    if (afterMap.has(key)) continue;
    if (isNotFound(beforeField.value)) continue;
    changes.push({ panel, panelLabel, label: beforeField.label, before: beforeField.value, after: "", kind: "removed" });
  }
  return changes;
}

export function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isNotFound(value: string): boolean {
  return /^not\s+found$/i.test(value.trim());
}

export function mergeOverrides(
  fields: BriefField[],
  overridesForPanel: Record<string, string> | undefined,
  preferredOrder: string[]
): BriefField[] {
  if (!overridesForPanel || Object.keys(overridesForPanel).length === 0) return fields;
  const lower = (s: string) => s.toLowerCase();
  const remaining = new Map<string, { label: string; value: string }>();
  for (const [label, value] of Object.entries(overridesForPanel)) {
    remaining.set(lower(label), { label, value });
  }
  const merged = fields.map((field) => {
    const hit = remaining.get(lower(field.label));
    if (!hit) return field;
    remaining.delete(lower(field.label));
    return { ...field, value: hit.value, sourceIdx: undefined, override: true };
  });
  // Append remaining overrides in preferred-label order first, then anything left
  for (const label of preferredOrder) {
    const hit = remaining.get(lower(label));
    if (!hit) continue;
    merged.push({ label: hit.label, value: hit.value, override: true });
    remaining.delete(lower(label));
  }
  for (const { label, value } of Array.from(remaining.values())) {
    merged.push({ label, value, override: true });
  }
  return merged;
}

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
