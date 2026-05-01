"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AgentFinding,
  Citation,
  Deal,
  DocumentMetadata,
  FollowupEvent,
  InvestigationEvent,
  InvestigationSummary,
} from "@/lib/api";
import {
  askFollowup,
  getInvestigation,
  listInvestigations,
  startInvestigation,
  sweepStream,
  type SweepEvent,
  type WorkstreamEvent,
} from "@/lib/api";
import { ACCENT } from "@/components/dd/types";
import AgentActiveState from "./AgentActiveState";
import AgentCitPanel from "./AgentCitPanel";
import AgentIdleState from "./AgentIdleState";
import AgentLeftSidebar from "./AgentLeftSidebar";
import type { AgentFollowupTurn, AgentLocalCitation, RunState } from "./types";
import {
  agentFindingToLocal,
  buildAgentDocs,
  buildDefaultTasks,
  completeAllTasks,
  mapToolToTask,
  normalizeEvidence,
} from "./agentUtils";
import {
  emptyAccumulator,
  getProactiveScanTemplates,
  mergeSweepAnswer,
} from "./sweepRun";

interface Props {
  deal: Deal;
  documents: DocumentMetadata[];
  onOpenDocument?: (citation: Citation) => void;
}

function initialRunState(documents: DocumentMetadata[]): RunState {
  const docs = buildAgentDocs(documents);
  return {
    phase: "idle",
    prompt: "",
    tasks: buildDefaultTasks(docs),
    findings: [],
    evidence: [],
    synthText: "",
    synthDone: false,
    investigationId: null,
    error: null,
  };
}

function Spinner({ size = 10, color = "#22c55e" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "spin .8s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

export default function AgentAnalysisPage({ deal, documents, onOpenDocument }: Props) {
  const router = useRouter();
  const docs = useMemo(() => buildAgentDocs(documents), [documents]);
  const [history, setHistory] = useState<InvestigationSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState("");
  const [runState, setRunState] = useState<RunState>(() => initialRunState(documents));
  const [activeCitation, setActiveCitation] = useState<AgentLocalCitation | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [followups, setFollowups] = useState<AgentFollowupTurn[]>([]);
  const [followupDraft, setFollowupDraft] = useState("");
  const [followupStreaming, setFollowupStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const followupAbortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const items = await listInvestigations(deal.deal_id);
      setHistory(items);
      setHistoryError(null);
    } catch (err) {
      setHistoryError((err as Error).message);
    }
  }, [deal.deal_id]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      followupAbortRef.current?.abort();
    };
  }, []);

  function updateTask(taskId: string, updater: (status: RunState["tasks"][number]) => RunState["tasks"][number]) {
    setRunState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    }));
  }

  function markTaskRunning(taskId: string) {
    updateTask(taskId, (task) => ({
      ...task,
      status: task.status === "complete" ? "complete" : "running",
      pagesRead: task.pagesRead || Math.min(task.pagesTotal, Math.max(1, Math.round(task.pagesTotal * 0.15))),
    }));
  }

  function markTaskComplete(taskId: string) {
    updateTask(taskId, (task) => ({
      ...task,
      status: "complete",
      pagesRead: task.pagesTotal,
    }));
  }

  function handleInvestigationEvent(event: InvestigationEvent) {
    if (event.type === "status" && event.investigation_id) {
      setRunState((prev) => ({ ...prev, investigationId: event.investigation_id || prev.investigationId }));
      return;
    }

    if (event.type === "status" && event.status === "writing_memo") {
      setRunState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.isSynth
            ? { ...task, status: "running" }
            : task.status === "pending"
              ? { ...task, status: "complete", pagesRead: task.pagesTotal }
              : task
        ),
      }));
      return;
    }

    if (event.type === "tool_call") {
      markTaskRunning(mapToolToTask(event.tool, event.args));
      return;
    }

    if (event.type === "tool_result") {
      setRunState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.status === "running" && !task.isSynth
            ? { ...task, pagesRead: Math.min(task.pagesTotal, Math.max(task.pagesRead + Math.ceil(task.pagesTotal * 0.28), Math.ceil(task.pagesTotal * 0.55))) }
            : task
        ),
      }));
      return;
    }

    if (event.type === "finding") {
      const finding: AgentFinding = {
        category: event.category,
        claim: event.claim,
        severity: event.severity,
        citations: event.citations || [],
      };
      const local = agentFindingToLocal(finding, runState.findings.length);
      markTaskComplete(local.taskId);
      setRunState((prev) => ({ ...prev, findings: [...prev.findings, local] }));
      return;
    }

    if (event.type === "memo_token") {
      setRunState((prev) => ({ ...prev, synthText: prev.synthText + event.token }));
      return;
    }

    if (event.type === "done") {
      setRunState((prev) => {
        const hasStreamedFindings = prev.findings.length > 0;
        return {
          ...prev,
          phase: "complete",
          synthText: event.memo || prev.synthText,
          synthDone: true,
          findings: hasStreamedFindings ? prev.findings : (event.findings || []).map(agentFindingToLocal),
          evidence: normalizeEvidence(event.evidence),
          tasks: completeAllTasks(prev.tasks),
        };
      });
      refreshHistory();
      return;
    }

    if (event.type === "error") {
      setRunState((prev) => ({
        ...prev,
        phase: "error",
        error: event.error,
        synthDone: true,
        tasks: completeAllTasks(prev.tasks),
      }));
    }
  }

  function runProactiveScan() {
    const templates = getProactiveScanTemplates();
    if (templates.length === 0) return;

    abortRef.current?.abort();
    followupAbortRef.current?.abort();
    setActiveCitation(null);
    setSelectedRun(null);
    setInputPrompt("");
    setFollowups([]);
    setFollowupDraft("");
    setFollowupStreaming(false);

    setRunState({
      phase: "running",
      prompt: "Proactive scan across all documents",
      tasks: buildDefaultTasks(docs),
      findings: [],
      evidence: [],
      synthText: "",
      synthDone: false,
      investigationId: null,
      error: null,
    });

    const queryToLabel = new Map<string, string>();
    for (const t of templates) queryToLabel.set(t.query, t.label);
    let acc = emptyAccumulator();

    abortRef.current = sweepStream(
      deal.deal_id,
      templates.map((t) => t.query),
      (event: SweepEvent) => {
        if (event.type === "sweep_meta") return;
        if (event.type === "sweep_done") {
          setRunState((prev) => ({
            ...prev,
            phase: "complete",
            synthDone: true,
            tasks: completeAllTasks(prev.tasks),
          }));
          return;
        }
        const ws = event as WorkstreamEvent;
        if (ws.type !== "done") return;
        const label = queryToLabel.get(ws.question) ?? "Scan area";
        acc = mergeSweepAnswer(acc, {
          label,
          answer: ws.answer,
          citations: ws.citations,
        });
        setRunState((prev) => ({
          ...prev,
          synthText: acc.memo,
          evidence: acc.evidence,
        }));
      },
      () => {
        setRunState((prev) =>
          prev.phase === "error"
            ? prev
            : {
                ...prev,
                phase: "complete",
                synthDone: true,
                tasks: completeAllTasks(prev.tasks),
              }
        );
      },
      (err) => {
        setRunState((prev) => ({
          ...prev,
          phase: "error",
          error: err.message || String(err),
          synthDone: true,
          tasks: completeAllTasks(prev.tasks),
        }));
      }
    );
  }

  function submit(promptOverride?: string) {
    const q = (promptOverride ?? inputPrompt).trim();
    if (!q) return;

    abortRef.current?.abort();
    followupAbortRef.current?.abort();
    setActiveCitation(null);
    setSelectedRun(null);
    setInputPrompt(q);
    setFollowups([]);
    setFollowupDraft("");
    setFollowupStreaming(false);

    setRunState({
      phase: "running",
      prompt: q,
      tasks: buildDefaultTasks(docs),
      findings: [],
      evidence: [],
      synthText: "",
      synthDone: false,
      investigationId: null,
      error: null,
    });

    abortRef.current = startInvestigation(
      deal.deal_id,
      q,
      handleInvestigationEvent,
      () => {
        setRunState((prev) => prev.phase === "error" ? prev : {
          ...prev,
          phase: "complete",
          synthDone: true,
          tasks: completeAllTasks(prev.tasks),
        });
        refreshHistory();
      },
      (err) => {
        setRunState((prev) => ({
          ...prev,
          phase: "error",
          error: err.message || String(err),
          synthDone: true,
          tasks: completeAllTasks(prev.tasks),
        }));
      }
    );
  }

  async function loadRun(investigationId: string) {
    abortRef.current?.abort();
    followupAbortRef.current?.abort();
    setSelectedRun(investigationId);
    setActiveCitation(null);
    setFollowupStreaming(false);
    try {
      const record = await getInvestigation(deal.deal_id, investigationId);
      setRunState({
        phase: "complete",
        prompt: record.goal || "General diligence investigation",
        tasks: completeAllTasks(buildDefaultTasks(docs)),
        findings: (record.findings || []).map(agentFindingToLocal),
        evidence: normalizeEvidence(record.evidence as Array<Record<string, unknown>> | undefined),
        synthText: record.memo || "",
        synthDone: true,
        investigationId: record.id,
        error: null,
      });
      setFollowups(record.followups || []);
      setFollowupDraft("");
    } catch (err) {
      setRunState((prev) => ({
        ...prev,
        phase: "error",
        error: (err as Error).message || "Failed to load run",
      }));
    }
  }

  function reset() {
    abortRef.current?.abort();
    followupAbortRef.current?.abort();
    setRunState(initialRunState(documents));
    setInputPrompt("");
    setSelectedRun(null);
    setActiveCitation(null);
    setFollowups([]);
    setFollowupDraft("");
    setFollowupStreaming(false);
  }

  function updateLastFollowup(content: string, streaming: boolean) {
    setFollowups((prev) => prev.map((turn, index) =>
      index === prev.length - 1 ? { ...turn, content, streaming } : turn
    ));
  }

  function sendFollowup() {
    const q = followupDraft.trim();
    if (!q || followupStreaming || !runState.investigationId) return;
    setFollowupDraft("");
    setFollowupStreaming(true);
    setFollowups((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", streaming: true },
    ]);

    followupAbortRef.current = askFollowup(
      deal.deal_id,
      runState.investigationId,
      q,
      (event: FollowupEvent) => {
        if (event.type === "token") {
          setFollowups((prev) => prev.map((turn, index) =>
            index === prev.length - 1 ? { ...turn, content: turn.content + event.token } : turn
          ));
        }
        if (event.type === "done") {
          updateLastFollowup(event.content, false);
          setFollowupStreaming(false);
          refreshHistory();
        }
        if (event.type === "error") {
          updateLastFollowup(`Error: ${event.error}`, false);
          setFollowupStreaming(false);
        }
      },
      undefined,
      (err) => {
        updateLastFollowup(`Error: ${err.message || String(err)}`, false);
        setFollowupStreaming(false);
      }
    );
  }

  const totalPages = docs.reduce((sum, doc) => sum + doc.pages, 0);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", overflow: "hidden", background: "#0f172a" }}>
      <div style={{ background: "#0f172a", padding: "0 20px", display: "flex", alignItems: "center", height: 52, gap: 12, flexShrink: 0, borderBottom: "1px solid #1e293b" }}>
        <button onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer" }}>
          <div style={{ width: 28, height: 28, background: ACCENT, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "white" }}>V</div>
          <span style={{ color: "white", fontWeight: 600, fontSize: 14 }}>Vyntic</span>
        </button>
        <span style={{ color: "#334155" }}>›</span>
        <span style={{ color: "#475569", fontSize: 13 }}>Deals</span>
        <span style={{ color: "#334155" }}>›</span>
        <button onClick={() => router.push(`/deal/${deal.deal_id}`)} style={{ color: "#94a3b8", fontSize: 13, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {deal.name}
        </button>
        <span style={{ color: "#334155" }}>›</span>
        <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>Agent Analysis</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "#1e293b", border: "1px solid #334155", borderRadius: 99, marginLeft: 8 }}>
          {runState.phase === "running" ? <Spinner /> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: runState.phase === "complete" ? "#22c55e" : "#64748b" }} />}
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {runState.phase === "running" ? "Analyzing..." : runState.phase === "complete" ? "Analysis complete" : runState.phase === "error" ? "Needs attention" : "Ready"}
          </span>
        </div>

        <div style={{ flex: 1 }} />
        {historyError && <span style={{ fontSize: 11, color: "#fca5a5" }}>History unavailable</span>}
        <button
          onClick={() => router.push(`/deal/${deal.deal_id}`)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#334155";
            e.currentTarget.style.color = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1e293b";
            e.currentTarget.style.color = "#94a3b8";
          }}
          style={{ padding: "6px 14px", background: "#1e293b", color: "#94a3b8", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1px solid #334155", cursor: "pointer" }}
        >
          ← Workspace
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <AgentLeftSidebar history={history} docs={docs} selectedRun={selectedRun} onSelectRun={loadRun} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f8fafc", borderLeft: "1px solid #1e293b" }}>
          {runState.phase === "idle" ? (
            <AgentIdleState
              dealName={deal.name}
              totalPages={totalPages}
              documentCount={docs.length}
              prompt={inputPrompt}
              setPrompt={setInputPrompt}
              onSubmit={submit}
              onProactiveScan={runProactiveScan}
            />
          ) : (
            <AgentActiveState
              runState={runState}
              docs={docs}
              activeCitationId={activeCitation?.id || null}
              followups={followups}
              followupDraft={followupDraft}
              followupStreaming={followupStreaming}
              onCitation={setActiveCitation}
              onReset={reset}
              onWorkspace={() => router.push(`/deal/${deal.deal_id}`)}
              onFollowupDraft={setFollowupDraft}
              onSendFollowup={sendFollowup}
            />
          )}
        </div>
        {activeCitation && (
          <AgentCitPanel
            citation={activeCitation}
            onClose={() => setActiveCitation(null)}
            onOpenDocument={onOpenDocument}
          />
        )}
      </div>
    </div>
  );
}
