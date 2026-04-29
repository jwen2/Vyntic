"use client";

import type { AgentFinding, DocumentMetadata } from "@/lib/api";
import type { AgentDoc, AgentLocalCitation, AgentLocalFinding, AgentSeverity, AgentTask } from "./types";
import { DOC_COLORS } from "./types";

export function classifyDoc(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("cim")) return "cim";
  if (lower.includes("qoe") || lower.includes("quality")) return "qoe";
  if (
    lower.includes("10k") ||
    lower.includes("10-k") ||
    lower.includes("10q") ||
    lower.includes("10-q") ||
    lower.includes("annual") ||
    lower.includes("quarterly") ||
    lower.includes("sec")
  ) return "filing";
  if (lower.includes("fin") || lower.includes("model") || lower.includes("lbo")) return "fin";
  if (lower.includes("legal") || lower.includes("ip")) return "legal";
  if (lower.includes("ops") || lower.includes("operational") || lower.includes("hr")) return "ops";
  return "other";
}

export function shortDocName(filename: string): string {
  const kind = classifyDoc(filename);
  if (kind === "cim") return "CIM";
  if (kind === "qoe") return "QoE";
  if (kind === "filing") {
    const lower = filename.toLowerCase();
    if (lower.includes("10k") || lower.includes("10-k")) return "10-K";
    if (lower.includes("10q") || lower.includes("10-q")) return "10-Q";
    return "SEC Filing";
  }
  if (kind === "fin") return "Financials";
  if (kind === "legal") return "Legal DD";
  if (kind === "ops") return "Ops DD";
  return filename.replace(/\.[^.]+$/, "").slice(0, 18);
}

export function buildAgentDocs(documents: DocumentMetadata[]): AgentDoc[] {
  return documents.map((doc) => {
    const kind = classifyDoc(doc.filename);
    return {
      id: doc.doc_id,
      short: shortDocName(doc.filename),
      name: doc.filename,
      pages: doc.page_count || 0,
      color: DOC_COLORS[kind] || DOC_COLORS.other,
    };
  });
}

function pagesForKinds(docs: AgentDoc[], kinds: string[]): number {
  if (kinds.includes("all")) return docs.reduce((sum, d) => sum + d.pages, 0);
  return docs
    .filter((doc) => {
      const kind = classifyDoc(doc.name);
      return kinds.includes(kind);
    })
    .reduce((sum, d) => sum + d.pages, 0);
}

export function buildDefaultTasks(docs: AgentDoc[]): AgentTask[] {
  const hasKind = (kind: string) => docs.some((doc) => classifyDoc(doc.name) === kind);
  const tasks: Array<{
    id: string;
    label: string;
    docs: string[];
    color: string;
    isSynth?: boolean;
  }> = [];

  if (hasKind("cim")) {
    tasks.push({ id: "commercial", label: "Scan CIM for commercial & market risks", docs: ["cim"], color: "#2563eb" });
  }

  const hasFinancialDocs = hasKind("qoe") || hasKind("fin") || hasKind("filing");
  if (hasFinancialDocs) {
    const financialDocs = ["qoe", "fin", "filing"].filter(hasKind);
    tasks.push({
      id: "financial",
      label: hasKind("filing") && !hasKind("qoe") && !hasKind("fin")
        ? "Analyze SEC filing financials & risk factors"
        : "Cross-reference financial materials",
      docs: financialDocs,
      color: "#7c3aed",
    });
  }

  if (hasKind("legal")) {
    tasks.push({ id: "legal", label: "Deep-scan Legal DD for litigation exposure", docs: ["legal"], color: "#b45309" });
  }

  if (hasKind("ops")) {
    tasks.push({ id: "ops", label: "Management & operational risk assessment", docs: ["ops"], color: "#059669" });
  }

  if (docs.length > 1) {
    tasks.push({
      id: "xdoc",
      label: "Cross-document consistency validation",
      docs: ["all"],
      color: "#0891b2",
    });
  } else if (!tasks.length && docs.length === 1) {
    tasks.push({
      id: "xdoc",
      label: `Scan ${docs[0].short} for key risks and disclosures`,
      docs: ["all"],
      color: "#0891b2",
    });
  } else if (!tasks.length) {
    tasks.push({
      id: "xdoc",
      label: "Waiting for uploaded documents",
      docs: ["all"],
      color: "#0891b2",
    });
  }

  tasks.push({ id: "synth", label: "Synthesizing findings & generating report", docs: ["all"], color: "#64748b", isSynth: true });

  return tasks.map((task) => ({
    ...task,
    pagesTotal: task.isSynth ? 0 : pagesForKinds(docs, task.docs),
    pagesRead: 0,
    status: "pending" as const,
  }));
}

export function mapToolToTask(tool: string, args?: Record<string, unknown>): string {
  const docId = typeof args?.doc_id === "string" ? args.doc_id.toLowerCase() : "";
  if (docId.includes("legal")) return "legal";
  if (docId.includes("qoe") || docId.includes("fin") || docId.includes("lbo")) return "financial";
  if (docId.includes("ops") || docId.includes("hr")) return "ops";
  if (docId.includes("cim")) return "commercial";
  if (tool === "search_document" || tool === "read_pages") return "xdoc";
  if (tool === "finish") return "synth";
  return "xdoc";
}

export function taskForFinding(finding: AgentFinding): string {
  const text = `${finding.category} ${finding.claim}`.toLowerCase();
  if (text.includes("legal") || text.includes("litigation") || text.includes("ip")) return "legal";
  if (text.includes("ebitda") || text.includes("revenue") || text.includes("margin") || text.includes("financial")) return "financial";
  if (text.includes("management") || text.includes("supplier") || text.includes("operational") || text.includes("cto")) return "ops";
  if (text.includes("customer") || text.includes("market") || text.includes("commercial")) return "commercial";
  return "xdoc";
}

export function severityFromApi(severity: AgentFinding["severity"]): AgentSeverity {
  if (severity === "red_flag") return "deal-breaker";
  if (severity === "watch") return "material";
  return "noteworthy";
}

export function citationToLocal(cit: AgentFinding["citations"][number], index: number): AgentLocalCitation {
  const file = cit.source_file || "Source";
  const stem = file
    .replace(/^.*\//, "")
    .replace(/\.[^.]+$/, "")
    .split(/[_\s-]+/)
    .find((part) => part.length > 1) || "Doc";
  return {
    id: `${file}-${cit.page}-${index}`,
    source_file: file,
    page: cit.page || 0,
    snippet: cit.snippet || "",
    sh: `${stem.slice(0, 7)}·p${cit.page || 0}`,
  };
}

export function agentFindingToLocal(finding: AgentFinding, index: number): AgentLocalFinding {
  return {
    id: `finding-${Date.now()}-${index}`,
    sev: severityFromApi(finding.severity),
    taskId: taskForFinding(finding),
    title: finding.category || "Agent finding",
    summary: finding.claim,
    citations: (finding.citations || []).map(citationToLocal),
  };
}

export function completeAllTasks(tasks: AgentTask[]): AgentTask[] {
  return tasks.map((task) => ({
    ...task,
    status: "complete",
    pagesRead: task.pagesTotal,
  }));
}
