import type { DocumentMetadata } from "@/lib/api";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import type { DocCoverage, Finding } from "./types";

export function shortDocName(filename: string): string {
  if (/CIM/i.test(filename)) return "CIM";
  if (/QoE/i.test(filename)) return "QoE Report";
  if (/Legal/i.test(filename)) return "Legal DD";
  if (/Operational|Ops/i.test(filename)) return "Ops DD";
  if (/\.(xlsx|xls|csv)$/i.test(filename)) return "Financials";
  const base = filename.replace(/\.[^.]+$/, "");
  return base.length > 16 ? base.slice(0, 14) + "…" : base;
}

/**
 * Derive coverage data for each document from the result cache + findings.
 * `cited` counts the number of distinct pages in the document that appear in
 * any citation across all workstreams' QuestionResult citations.
 */
export function computeCoverage(
  documents: DocumentMetadata[],
  resultCache: Record<string, Record<string, QuestionResult>>,
  findings: Finding[]
): DocCoverage[] {
  // filename → Set of cited pages
  const citedPages = new Map<string, Set<number>>();
  for (const wsResults of Object.values(resultCache)) {
    for (const r of Object.values(wsResults)) {
      if (!r?.citations) continue;
      for (const c of r.citations) {
        if (!c) continue;
        let set = citedPages.get(c.source_file);
        if (!set) {
          set = new Set();
          citedPages.set(c.source_file, set);
        }
        set.add(c.page);
      }
    }
  }

  return documents.map((d) => {
    const short = shortDocName(d.filename);
    const cited = citedPages.get(d.filename)?.size ?? 0;
    const flags = findings.filter((f) => f.src.includes(short)).length;
    const uncovered = cited === 0 && d.page_count > 0;
    return {
      id: d.doc_id,
      name: d.filename,
      short,
      pages: d.page_count,
      cited,
      flags,
      uncovered,
    };
  });
}

export function overallCoverage(docs: DocCoverage[]): number {
  const total = docs.reduce((s, d) => s + d.pages, 0);
  const cited = docs.reduce((s, d) => s + d.cited, 0);
  if (total === 0) return 0;
  return Math.round((cited / total) * 100);
}
