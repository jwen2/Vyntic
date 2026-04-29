"use client";

import type { AgentCitation } from "@/lib/api";

export type AgentPhase = "idle" | "running" | "complete" | "error";
export type TaskStatus = "pending" | "running" | "complete";
export type AgentSeverity = "deal-breaker" | "material" | "noteworthy";

export interface AgentDoc {
  id: string;
  short: string;
  name: string;
  pages: number;
  color: string;
}

export interface AgentTask {
  id: string;
  label: string;
  docs: string[];
  pagesTotal: number;
  pagesRead: number;
  status: TaskStatus;
  color: string;
  isSynth?: boolean;
}

export interface AgentLocalCitation extends AgentCitation {
  id: string;
  sh: string;
}

export interface AgentEvidenceItem {
  source_file: string;
  page: number;
  chunk: string;
}

export interface AgentLocalFinding {
  id: string;
  sev: AgentSeverity;
  taskId: string;
  title: string;
  summary: string;
  citations: AgentLocalCitation[];
}

export interface AgentFollowupTurn {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export interface RunState {
  phase: AgentPhase;
  prompt: string;
  tasks: AgentTask[];
  findings: AgentLocalFinding[];
  evidence: AgentEvidenceItem[];
  synthText: string;
  synthDone: boolean;
  investigationId: string | null;
  error: string | null;
}

export const DOC_COLORS: Record<string, string> = {
  cim: "#2563eb",
  qoe: "#7c3aed",
  fin: "#0891b2",
  filing: "#7c3aed",
  legal: "#b45309",
  ops: "#059669",
  all: "#64748b",
  other: "#64748b",
};

export const SEV = {
  "deal-breaker": {
    dot: "#ef4444",
    border: "#fecaca",
    bg: "#fef2f2",
    color: "#dc2626",
    label: "Deal-Breaker",
  },
  material: {
    dot: "#f59e0b",
    border: "#fde68a",
    bg: "#fffbeb",
    color: "#b45309",
    label: "Material",
  },
  noteworthy: {
    dot: "#3b82f6",
    border: "#bfdbfe",
    bg: "#eff6ff",
    color: "#1d4ed8",
    label: "Noteworthy",
  },
} as const;
