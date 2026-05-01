"use client";

import type { Citation } from "@/lib/api";
import { DD_WORKSTREAMS } from "@/lib/queryTemplates";
import { citationToLocal } from "./agentUtils";
import type {
  AgentEvidenceItem,
  AgentLocalCitation,
} from "./types";

/**
 * Returns the 11 proactive-scan templates from the workspace workstream so the
 * agent chat's "Run Proactive Scan" button issues the same queries the
 * workspace sweep panel does.
 */
export function getProactiveScanTemplates() {
  const ws = DD_WORKSTREAMS.find((w) => w.id === "proactive_scan");
  return ws?.templates ?? [];
}

export interface SweepMergeAccumulator {
  /** Markdown memo built from all completed scan-area answers. */
  memo: string;
  /** Global citation list (1-indexed in the rendered memo via [Source N]). */
  citations: AgentLocalCitation[];
  /** Distinct evidence chunks for the citations panel. */
  evidence: AgentEvidenceItem[];
}

export function emptyAccumulator(): SweepMergeAccumulator {
  return { memo: "", citations: [], evidence: [] };
}

/**
 * Append one scan-area answer to the running accumulator. Re-numbers the
 * answer's local [Source N] markers to global indices that point into the
 * merged citations array — without this, [Source 1] would collide across
 * the 11 separate answers.
 */
export function mergeSweepAnswer(
  prev: SweepMergeAccumulator,
  args: {
    label: string;
    answer: string;
    citations: (Citation | null)[];
  }
): SweepMergeAccumulator {
  const { label, answer, citations } = args;

  // Build remap: local index (0-based) -> global index (0-based) we'll assign
  // as we encounter unique citations. A citation's identity is (file, page).
  const localToGlobal = new Map<number, number>();
  const newCitations = [...prev.citations];
  const newEvidence = [...prev.evidence];

  citations.forEach((cit, localIdx) => {
    if (!cit) return;
    const key = `${cit.source_file}::${cit.page}`;
    const existingIdx = newCitations.findIndex(
      (c) => `${c.source_file}::${c.page}` === key
    );
    if (existingIdx >= 0) {
      localToGlobal.set(localIdx, existingIdx);
      return;
    }
    const globalIdx = newCitations.length;
    const local = citationToLocal(
      {
        source_file: cit.source_file,
        page: cit.page,
        snippet: cit.text_snippet,
      },
      globalIdx
    );
    newCitations.push(local);
    newEvidence.push({
      source_file: cit.source_file,
      page: cit.page,
      chunk: cit.text_snippet || "",
    });
    localToGlobal.set(localIdx, globalIdx);
  });

  // Rewrite [Source N] in the answer text to use global 1-based indices.
  const remapped = answer.replace(/\[Source\s+(\d+)\]/g, (match, n: string) => {
    const localIdx = parseInt(n, 10) - 1;
    const globalIdx = localToGlobal.get(localIdx);
    if (globalIdx === undefined) return ""; // drop dangling references
    return `[Source ${globalIdx + 1}]`;
  });

  const section = `## ${label}\n\n${remapped.trim()}\n\n`;
  return {
    memo: prev.memo + section,
    citations: newCitations,
    evidence: newEvidence,
  };
}
