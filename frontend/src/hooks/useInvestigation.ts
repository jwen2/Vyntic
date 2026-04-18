"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentFinding,
  FollowupEvent,
  FollowupTurn,
  InvestigationEvent,
  InvestigationRecord,
  InvestigationSummary,
  askFollowup,
  deleteInvestigation,
  getInvestigation,
  listInvestigations,
  startInvestigation,
} from "@/lib/api";

export type InvestigationStatus =
  | "idle"
  | "starting"
  | "thinking"
  | "writing_memo"
  | "done"
  | "error";

export type TranscriptEntry =
  | { kind: "thought"; text: string }
  | {
      kind: "tool";
      id: string;
      tool: string;
      args: Record<string, unknown>;
      summary?: string;
    }
  | { kind: "finding"; finding: AgentFinding };

export type FollowupStatus = "idle" | "sending" | "streaming" | "error";

export interface InvestigationState {
  status: InvestigationStatus;
  dealId: string | null;
  investigationId: string | null;
  goal: string;
  transcript: TranscriptEntry[];
  findings: AgentFinding[];
  memo: string;
  error: string | null;
  duration_ms?: number;
  model?: string;
  fallback?: boolean;
  readOnly: boolean;

  // Follow-up chat state
  followups: FollowupTurn[];
  followupStatus: FollowupStatus;
  followupError: string | null;
  followupDraftAnswer: string;

  // History (sidebar)
  history: InvestigationSummary[];
  historyLoading: boolean;
}

const INITIAL: InvestigationState = {
  status: "idle",
  dealId: null,
  investigationId: null,
  goal: "",
  transcript: [],
  findings: [],
  memo: "",
  error: null,
  readOnly: false,
  followups: [],
  followupStatus: "idle",
  followupError: null,
  followupDraftAnswer: "",
  history: [],
  historyLoading: false,
};

export function useInvestigation() {
  const [state, setState] = useState<InvestigationState>(INITIAL);
  const controllerRef = useRef<AbortController | null>(null);
  const followupControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((s) =>
      s.status === "done" || s.status === "error"
        ? s
        : { ...s, status: "done" }
    );
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    followupControllerRef.current?.abort();
    followupControllerRef.current = null;
    setState(INITIAL);
  }, []);

  const refreshHistory = useCallback(async (dealId: string) => {
    setState((s) => ({ ...s, historyLoading: true }));
    try {
      const items = await listInvestigations(dealId);
      setState((s) =>
        s.dealId === dealId ? { ...s, history: items, historyLoading: false } : s
      );
    } catch {
      setState((s) => ({ ...s, historyLoading: false }));
    }
  }, []);

  const start = useCallback(
    (dealId: string, goal: string) => {
      controllerRef.current?.abort();
      followupControllerRef.current?.abort();

      setState((prev) => ({
        ...INITIAL,
        status: "starting",
        dealId,
        goal,
        history: prev.dealId === dealId ? prev.history : [],
      }));

      controllerRef.current = startInvestigation(
        dealId,
        goal || undefined,
        (event: InvestigationEvent) => {
          setState((s) => applyEvent(s, event));
        },
        () => {
          setState((s) =>
            s.status === "error" ? s : { ...s, status: "done" }
          );
          // Refresh history once the run completes.
          refreshHistory(dealId);
        },
        (err) => {
          setState((s) => ({
            ...s,
            status: "error",
            error: err.message || String(err),
          }));
          refreshHistory(dealId);
        }
      );
    },
    [refreshHistory]
  );

  const loadInvestigation = useCallback(
    async (dealId: string, investigationId: string) => {
      controllerRef.current?.abort();
      followupControllerRef.current?.abort();
      setState((prev) => ({
        ...prev,
        status: "starting",
        dealId,
        investigationId,
        error: null,
      }));
      try {
        const rec: InvestigationRecord = await getInvestigation(dealId, investigationId);
        const transcript = transcriptFromRecord(rec);
        setState((prev) => ({
          ...prev,
          dealId,
          investigationId: rec.id,
          goal: rec.goal || "",
          status: rec.status === "error" ? "error" : "done",
          transcript,
          findings: rec.findings || [],
          memo: rec.memo || "",
          error: rec.status === "error" ? "Investigation ended with an error." : null,
          duration_ms: rec.duration_ms,
          model: rec.model,
          fallback: rec.fallback,
          readOnly: true,
          followups: rec.followups || [],
          followupStatus: "idle",
          followupError: null,
          followupDraftAnswer: "",
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: (err as Error).message || "Failed to load investigation",
        }));
      }
    },
    []
  );

  const removeInvestigation = useCallback(
    async (dealId: string, investigationId: string) => {
      try {
        await deleteInvestigation(dealId, investigationId);
      } catch {
        /* ignore */
      }
      setState((prev) => {
        const history = prev.history.filter((h) => h.id !== investigationId);
        if (prev.investigationId === investigationId) {
          return { ...INITIAL, dealId: prev.dealId, history };
        }
        return { ...prev, history };
      });
    },
    []
  );

  const sendFollowup = useCallback((question: string) => {
    const q = question.trim();
    if (!q) return;
    setState((prev) => {
      if (!prev.dealId || !prev.investigationId) return prev;
      if (prev.status === "thinking" || prev.status === "writing_memo" || prev.status === "starting") {
        return prev;
      }

      const userTurn: FollowupTurn = { role: "user", content: q };
      followupControllerRef.current?.abort();

      followupControllerRef.current = askFollowup(
        prev.dealId,
        prev.investigationId,
        q,
        (event: FollowupEvent) => {
          setState((s) => applyFollowupEvent(s, event));
        },
        () => {
          setState((s) =>
            s.followupStatus === "error"
              ? s
              : { ...s, followupStatus: "idle", followupDraftAnswer: "" }
          );
        },
        (err) => {
          setState((s) => ({
            ...s,
            followupStatus: "error",
            followupError: err.message || String(err),
          }));
        }
      );

      return {
        ...prev,
        followups: [...prev.followups, userTurn],
        followupStatus: "sending",
        followupError: null,
        followupDraftAnswer: "",
      };
    });
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      followupControllerRef.current?.abort();
    };
  }, []);

  return {
    state,
    start,
    stop,
    reset,
    refreshHistory,
    loadInvestigation,
    removeInvestigation,
    sendFollowup,
  };
}

function applyEvent(
  s: InvestigationState,
  event: InvestigationEvent
): InvestigationState {
  switch (event.type) {
    case "status":
      if (event.status === "started") {
        return {
          ...s,
          status: "thinking",
          investigationId: event.investigation_id || s.investigationId,
          readOnly: false,
        };
      }
      if (event.status === "writing_memo") {
        return { ...s, status: "writing_memo" };
      }
      return s;

    case "thought":
      return {
        ...s,
        status: s.status === "starting" ? "thinking" : s.status,
        transcript: [...s.transcript, { kind: "thought", text: event.token }],
      };

    case "tool_call":
      return {
        ...s,
        transcript: [
          ...s.transcript,
          {
            kind: "tool",
            id: event.id,
            tool: event.tool,
            args: event.args || {},
          },
        ],
      };

    case "tool_result": {
      const transcript = s.transcript.map((entry) =>
        entry.kind === "tool" && entry.id === event.id
          ? { ...entry, summary: event.summary }
          : entry
      );
      return { ...s, transcript };
    }

    case "finding": {
      const finding: AgentFinding = {
        category: event.category,
        claim: event.claim,
        severity: event.severity,
        citations: event.citations || [],
      };
      return {
        ...s,
        findings: [...s.findings, finding],
        transcript: [...s.transcript, { kind: "finding", finding }],
      };
    }

    case "memo_token":
      return {
        ...s,
        status: "writing_memo",
        memo: s.memo + event.token,
      };

    case "done":
      return {
        ...s,
        status: "done",
        memo: event.memo || s.memo,
        findings: event.findings && event.findings.length ? event.findings : s.findings,
        duration_ms: event.duration_ms,
        model: event.model,
        fallback: event.fallback,
      };

    case "error":
      return { ...s, status: "error", error: event.error };

    default:
      return s;
  }
}

function applyFollowupEvent(
  s: InvestigationState,
  event: FollowupEvent
): InvestigationState {
  switch (event.type) {
    case "status":
      return {
        ...s,
        followupStatus: event.status === "answering" ? "streaming" : s.followupStatus,
      };
    case "token":
      return {
        ...s,
        followupStatus: "streaming",
        followupDraftAnswer: s.followupDraftAnswer + event.token,
      };
    case "done": {
      const answer = event.content || s.followupDraftAnswer;
      const turn: FollowupTurn = {
        role: "assistant",
        content: answer,
        model: event.model,
        fallback: event.fallback,
        duration_ms: event.duration_ms,
      };
      return {
        ...s,
        followups: [...s.followups, turn],
        followupStatus: "idle",
        followupError: null,
        followupDraftAnswer: "",
      };
    }
    case "error":
      return {
        ...s,
        followupStatus: "error",
        followupError: event.error,
      };
    default:
      return s;
  }
}

function transcriptFromRecord(rec: InvestigationRecord): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  const tools = new Map<string, { id: string; tool: string; args: Record<string, unknown>; summary?: string }>();
  for (const ev of rec.transcript || []) {
    if (!ev || typeof ev !== "object") continue;
    switch (ev.type) {
      case "thought":
        out.push({ kind: "thought", text: ev.token });
        break;
      case "tool_call": {
        const entry = {
          kind: "tool" as const,
          id: ev.id,
          tool: ev.tool,
          args: ev.args || {},
        };
        tools.set(ev.id, entry);
        out.push(entry);
        break;
      }
      case "tool_result": {
        const existing = tools.get(ev.id);
        if (existing) existing.summary = ev.summary;
        break;
      }
      case "finding": {
        const finding: AgentFinding = {
          category: ev.category,
          claim: ev.claim,
          severity: ev.severity,
          citations: ev.citations || [],
        };
        out.push({ kind: "finding", finding });
        break;
      }
      default:
        break;
    }
  }
  return out;
}
