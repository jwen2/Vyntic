import type { QuestionResult } from "@/components/WorkstreamPanel";
import type { QueryTemplate } from "@/lib/queryTemplates";
import type { Citation } from "@/lib/api";
import type { Finding, FindingSeverity } from "./types";
import { shortDocName } from "./coverage";

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const SEVERITY_TAG = /(?:\*\*)?\[(DEAL-BREAKER|MATERIAL|NOTEWORTHY)\](?:\*\*)?/g;

function tagToSeverity(tag: string): FindingSeverity {
  if (tag === "DEAL-BREAKER") return "deal-breaker";
  if (tag === "MATERIAL") return "material";
  return "noteworthy";
}

function cleanBodyForTitle(body: string): string {
  return body
    .replace(/^\s*[:—–-]\s*/, "")
    .replace(/^\*\*(.+?)\*\*\s*[:—–-]?\s*/, "$1 — ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFromAnswer(
  query: string,
  label: string,
  result: QuestionResult
): Finding[] {
  if (result.status !== "complete" || !result.answer) return [];
  const text = stripThinkTags(result.answer);
  const citations = result.citations || [];

  const matches: { sev: FindingSeverity; start: number; tagEnd: number }[] = [];
  SEVERITY_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEVERITY_TAG.exec(text)) !== null) {
    matches.push({ sev: tagToSeverity(m[1]), start: m.index, tagEnd: m.index + m[0].length });
  }

  const findings: Finding[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].start : text.length;
    const body = text.slice(cur.tagEnd, end).trim();
    if (!body) continue;

    const clean = cleanBodyForTitle(body);
    const firstSentence = clean.split(/(?<=[.!?])\s+|\n/)[0] ?? clean;
    const title =
      firstSentence.length > 140 ? firstSentence.slice(0, 137) + "…" : firstSentence;
    const detail = clean.length > 420 ? clean.slice(0, 417) + "…" : clean;

    const srcMatch = body.match(/\[Source\s+(\d+)\]/);
    let src = label;
    let conf = 68;
    if (srcMatch) {
      const idx = parseInt(srcMatch[1], 10) - 1;
      const c: Citation | null | undefined = citations[idx];
      if (c) {
        src = `${shortDocName(c.source_file)} · p.${c.page}`;
        conf = 86;
      }
    }

    const idSeed = `${cur.sev}:${clean.slice(0, 80)}`;
    const id = `scan-${djb2(idSeed)}`;

    findings.push({
      id,
      sev: cur.sev,
      title,
      detail,
      src,
      ws: "proactive_scan",
      qid: query,
      conf,
      status: null,
      note: null,
      origin: "scan",
    });
  }
  return findings;
}

export function extractScanFindings(
  scanResults: Record<string, QuestionResult>,
  templates: QueryTemplate[]
): Finding[] {
  const labelByQuery = new Map(templates.map((t) => [t.query, t.label]));
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const [query, result] of Object.entries(scanResults)) {
    const label = labelByQuery.get(query) || "Proactive scan";
    for (const f of extractFromAnswer(query, label, result)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}

export function scanHasLoading(scanResults: Record<string, QuestionResult>): boolean {
  return Object.values(scanResults).some((r) => r.status === "loading");
}
