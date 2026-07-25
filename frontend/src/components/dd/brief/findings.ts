// Finding classification/ordering helpers and scan-result lookups.
// Extracted verbatim from DealBriefDashboard.tsx (FE5.2) — no behaviour change.

import type { Finding, FindingSeverity } from "../types";
import type { BriefWorkstreamShim, QuestionResult } from "./config";

export function compareFindingSeverity(a: Finding, b: Finding): number {
  return severityRank(b.sev) - severityRank(a.sev);
}

export function severityRank(severity: FindingSeverity): number {
  if (severity === "deal-breaker") return 3;
  if (severity === "material") return 2;
  return 1;
}

export function isGapFinding(finding: Finding): boolean {
  return /gap|missing|absent|unprovided|incomplete|omission/i.test(`${finding.title} ${finding.detail}`);
}

export function isInconsistencyFinding(finding: Finding): boolean {
  return /inconsisten|conflict|mismatch|reconcile|differ|contradict/i.test(`${finding.title} ${finding.detail}`);
}

export function countSources(results: Array<QuestionResult | undefined>): number {
  const sources = new Set<string>();
  for (const result of results) {
    for (const citation of result?.citations || []) {
      if (!citation) continue;
      sources.add(`${citation.source_file}:${citation.page}`);
    }
  }
  return sources.size;
}

export function resultByLabel(
  workstream: BriefWorkstreamShim | null,
  results: Record<string, QuestionResult>,
  label: string
): QuestionResult | undefined {
  const query = workstream?.templates.find((template) => template.label === label)?.query;
  return query ? results[query] : undefined;
}
