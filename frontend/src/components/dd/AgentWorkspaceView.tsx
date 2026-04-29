"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentFinding,
  Citation,
  Deal,
  DocumentMetadata,
  FollowupEvent,
  InvestigationEvent,
} from "@/lib/api";
import {
  askFollowup,
  getInvestigation,
  startInvestigation,
} from "@/lib/api";
import AgentActiveState from "@/components/agent/AgentActiveState";
import AgentCitPanel from "@/components/agent/AgentCitPanel";
import AgentIdleState from "@/components/agent/AgentIdleState";
import type { AgentFollowupTurn, AgentLocalCitation, AgentLocalFinding, RunState } from "@/components/agent/types";
import {
  agentFindingToLocal,
  buildAgentDocs,
  buildDefaultTasks,
  completeAllTasks,
  mapToolToTask,
} from "@/components/agent/agentUtils";
import type { Finding } from "./types";

interface Props {
  deal: Deal;
  documents: DocumentMetadata[];
  onFindings: (findings: Finding[]) => void;
  onOpenDocument?: (citation: Citation) => void;
  onExport: () => void;
  focusInvestigationId?: string | null;
  focusFinding?: Finding | null;
  focusSignal?: number;
  onHistoryChange?: () => void | Promise<void>;
  pendingPrompt?: string | null;
  pendingPromptSignal?: number;
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

function localFindingToWorkspace(
  finding: AgentLocalFinding,
  index: number,
  investigationId: string | null
): Finding {
  const citation = finding.citations[0];
  const ws =
    finding.taskId === "legal" ? "legal" :
    finding.taskId === "financial" ? "financial" :
    finding.taskId === "ops" ? "operational" :
    finding.taskId === "commercial" ? "commercial" :
    "risk";

  return {
    id: `agent-ws-${Date.now()}-${index}`,
    sev: finding.sev,
    title: finding.title,
    detail: finding.summary,
    src: citation ? `${citation.source_file} · p.${citation.page}` : "Agent investigation",
    ws,
    qid: null,
    conf: finding.sev === "deal-breaker" ? 88 : finding.sev === "material" ? 78 : 66,
    status: null,
    note: null,
    origin: "agent",
    producerId: investigationId,
    sourceCitation: citation
      ? {
          source_file: citation.source_file,
          page: citation.page,
          text_snippet: citation.snippet || "",
        }
      : null,
  };
}

export default function AgentWorkspaceView({
  deal,
  documents,
  onFindings,
  onOpenDocument,
  onExport,
  focusInvestigationId,
  focusFinding,
  focusSignal = 0,
  onHistoryChange,
  pendingPrompt,
  pendingPromptSignal = 0,
}: Props) {
  const docs = useMemo(() => buildAgentDocs(documents), [documents]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [runState, setRunState] = useState<RunState>(() => initialRunState(documents));
  const [activeCitation, setActiveCitation] = useState<AgentLocalCitation | null>(null);
  const [followups, setFollowups] = useState<AgentFollowupTurn[]>([]);
  const [followupDraft, setFollowupDraft] = useState("");
  const [followupStreaming, setFollowupStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const followupAbortRef = useRef<AbortController | null>(null);
  const findingsRef = useRef<AgentLocalFinding[]>([]);
  const investigationIdRef = useRef<string | null>(null);
  const lastFocusRef = useRef<string | null>(null);
  const lastPendingSignalRef = useRef<number>(0);

  const refreshHistory = useCallback(() => {
    void onHistoryChange?.();
  }, [onHistoryChange]);

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

  function commitWorkspaceFindings(localFindings: AgentLocalFinding[], investigationId: string | null) {
    if (localFindings.length > 0) {
      onFindings(localFindings.map((finding, index) => localFindingToWorkspace(finding, index, investigationId)));
    }
  }

  function handleInvestigationEvent(event: InvestigationEvent) {
    if (event.type === "status" && event.investigation_id) {
      const isNewInvestigation = investigationIdRef.current !== event.investigation_id;
      investigationIdRef.current = event.investigation_id;
      setRunState((prev) => ({ ...prev, investigationId: event.investigation_id || prev.investigationId }));
      if (isNewInvestigation) refreshHistory();
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
      const local = agentFindingToLocal(finding, findingsRef.current.length);
      findingsRef.current = [...findingsRef.current, local];
      markTaskComplete(local.taskId);
      setRunState((prev) => ({ ...prev, findings: [...prev.findings, local] }));
      return;
    }

    if (event.type === "memo_token") {
      setRunState((prev) => ({ ...prev, synthText: prev.synthText + event.token }));
      return;
    }

    if (event.type === "done") {
      const doneFindings =
        findingsRef.current.length > 0
          ? findingsRef.current
          : (event.findings || []).map(agentFindingToLocal);
      findingsRef.current = doneFindings;
      commitWorkspaceFindings(doneFindings, investigationIdRef.current);
      setRunState((prev) => ({
        ...prev,
        phase: "complete",
        synthText: event.memo || prev.synthText,
        synthDone: true,
        findings: doneFindings,
        tasks: completeAllTasks(prev.tasks),
      }));
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

  function submit(promptOverride?: string) {
    const q = (promptOverride ?? inputPrompt).trim();
    if (!q) return;

    abortRef.current?.abort();
    followupAbortRef.current?.abort();
    findingsRef.current = [];
    investigationIdRef.current = null;
    setActiveCitation(null);
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
    setActiveCitation(null);
    setFollowupStreaming(false);
    try {
      const record = await getInvestigation(deal.deal_id, investigationId);
      const localFindings = (record.findings || []).map(agentFindingToLocal);
      findingsRef.current = localFindings;
      investigationIdRef.current = record.id;
      setRunState({
        phase: "complete",
        prompt: record.goal || "General diligence investigation",
        tasks: completeAllTasks(buildDefaultTasks(docs)),
        findings: localFindings,
        evidence: [],
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

  useEffect(() => {
    if (!focusInvestigationId) return;
    const focusKey = `${focusInvestigationId}:${focusSignal}`;
    if (lastFocusRef.current === focusKey) return;
    lastFocusRef.current = focusKey;
    loadRun(focusInvestigationId);
    // loadRun intentionally stays outside deps; it closes over current deal/docs state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusInvestigationId, focusSignal]);

  useEffect(() => {
    if (!pendingPrompt || !pendingPromptSignal) return;
    if (lastPendingSignalRef.current === pendingPromptSignal) return;
    lastPendingSignalRef.current = pendingPromptSignal;
    submit(pendingPrompt);
    // submit closes over current state; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, pendingPromptSignal]);

  function reset() {
    abortRef.current?.abort();
    followupAbortRef.current?.abort();
    findingsRef.current = [];
    investigationIdRef.current = null;
    setRunState(initialRunState(documents));
    setInputPrompt("");
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
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {runState.phase === "idle" ? (
          <AgentIdleState
            dealName={deal.name}
            totalPages={totalPages}
            documentCount={docs.length}
            prompt={inputPrompt}
            setPrompt={setInputPrompt}
            onSubmit={submit}
          />
        ) : (
          <AgentActiveState
            runState={runState}
            docs={docs}
            activeCitationId={activeCitation?.id || null}
            focusFinding={focusFinding}
            focusSignal={focusSignal}
            followups={followups}
            followupDraft={followupDraft}
            followupStreaming={followupStreaming}
            onCitation={setActiveCitation}
            onReset={reset}
            onWorkspace={onExport}
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
  );
}
