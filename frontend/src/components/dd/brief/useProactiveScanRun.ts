// Fetches the latest Proactive Scan / Fund Brief run for an entity and exposes
// it in the legacy QuestionResult shape. Extracted verbatim from
// DealBriefDashboard.tsx (FE5.3).

import { useCallback, useEffect, useMemo, useState } from "react";
import { listDocuments } from "@/lib/api";
import {
  getWorkflow,
  listRuns,
  startWorkflowRun,
  subscribeRun,
  type RunStreamEvent,
  type TabularCell,
  type Workflow,
  type WorkflowColumn,
  type WorkflowRun,
} from "@/lib/workflows";
import { extractFindingsFromRun } from "../extractFindingsFromRun";
import type { Finding } from "../types";
import type { BriefWorkstreamShim, QuestionResult } from "./config";

/**
 * The prose panels (financial highlights, investment thesis) parse the cell's
 * free-form text via extractMetrics / extractFinancialTables /
 * extractThesisSections. Prefer the typed `body`, then `summary`, then the raw
 * streamed answer. KV and list panels don't use this — they read the cell's
 * typed `answer_formatted` directly (see pairsToFields / deriveActions), so the
 * old JSON→fake-markdown→regex round-trip is gone.
 */
export function briefProse(cell: TabularCell): string {
  const raw = cell.answer || "";
  const formatted = cell.answer_formatted;
  if (formatted && typeof formatted === "object" && !Array.isArray(formatted)) {
    const prose = formatted as { summary?: string; body?: string };
    if (typeof prose.body === "string" && prose.body.trim()) return prose.body;
    if (typeof prose.summary === "string" && prose.summary.trim()) return prose.summary;
  }
  return raw;
}

export function cellToQuestionResult(cell: TabularCell): QuestionResult {
  return {
    answer: briefProse(cell),
    formatted: cell.answer_formatted,
    citations: cell.citations || [],
    status:
      cell.status === "complete"
        ? "complete"
        : cell.status === "error"
          ? "error"
          : cell.status === "running"
            ? "loading"
            : "pending",
    model: cell.model,
    fallback: cell.fallback,
    duration_ms: cell.duration_ms,
    completed_at: cell.completed_at ? new Date(cell.completed_at).getTime() : undefined,
  };
}

export function cellsToScanResults(cells: TabularCell[], columns: WorkflowColumn[]): Record<string, QuestionResult> {
  const colById = new Map(columns.map((col) => [col.id, col]));
  const out: Record<string, QuestionResult> = {};
  for (const cell of cells) {
    const col = colById.get(cell.column_id);
    if (!col) continue;
    // Brief lookups key by template.query == column.prompt verbatim.
    out[col.prompt] = cellToQuestionResult(cell);
  }
  return out;
}

export function workflowToScanShim(workflow: Workflow | null): BriefWorkstreamShim | null {
  if (!workflow || workflow.type !== "tabular") return null;
  return {
    id: "proactive_scan",
    templates: workflow.columns
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((col) => ({ label: col.label, query: col.prompt })),
  };
}

/**
 * Fetches the latest Proactive Scan workflow run for the deal and exposes it
 * in the legacy QuestionResult shape so the brief's parsing/rendering code
 * (~1.5k lines below) can stay untouched.
 */
export function useProactiveScanRun(dealId: string, workflowId: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, QuestionResult>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the workflow definition once on mount (or dealId/workflow change) so
  // we know the column layout the brief expects.
  useEffect(() => {
    let active = true;
    setWorkflow(null);
    setRun(null);
    setScanResults({});
    getWorkflow(dealId, workflowId)
      .then((wf) => {
        if (active) setWorkflow(wf);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflowId]);

  // Fetch the latest run on dealId change. We take the most recent non-aborted
  // run — pending/running/complete are all worth surfacing (the SSE
  // subscription below transitions a pending run to populated as cells stream
  // in). Only "cancelled" and "error" are skipped.
  useEffect(() => {
    let active = true;
    listRuns(dealId, workflowId)
      .then((runs) => {
        if (!active) return;
        const sorted = [...runs].sort((a, b) =>
          (b.started_at || "").localeCompare(a.started_at || ""),
        );
        const latest =
          sorted.find((r) => r.status !== "cancelled" && r.status !== "error") ?? null;
        setRun(latest);
        if (latest && workflow) {
          setScanResults(cellsToScanResults(latest.cells, workflow.columns));
        } else {
          setScanResults({});
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflowId, workflow]);

  // SSE subscription keyed by runId (not the full run object). Using the id
  // avoids reconnect churn: each "snapshot" event calls setRun(event.run)
  // which creates a new reference, but the id is stable across status
  // transitions, so the subscription stays open until the run actually
  // changes (e.g. the user kicks off a new one).
  const runId = run?.id ?? null;
  useEffect(() => {
    if (!runId || !workflow) return;
    const unsubscribe = subscribeRun(runId, (event: RunStreamEvent) => {
      if (event.type === "snapshot") {
        setRun(event.run);
        setScanResults(cellsToScanResults(event.run.cells, workflow.columns));
      } else if (event.type === "cell") {
        setScanResults((prev) => {
          const col = workflow.columns.find((c) => c.id === event.cell.column_id);
          if (!col) return prev;
          return {
            ...prev,
            [col.prompt]: cellToQuestionResult(event.cell),
          };
        });
      } else if (event.type === "run") {
        setRun((prev) => (prev ? { ...prev, status: event.status } : prev));
      }
    });
    return unsubscribe;
  }, [runId, workflow]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const docs = await listDocuments(dealId);
      if (docs.length === 0) {
        throw new Error("Upload at least one document before running the brief.");
      }
      const newRun = await startWorkflowRun(
        dealId,
        workflowId,
        docs.map((d) => d.doc_id),
        [],
      );
      setRun(newRun);
      // Seed scanResults with loading state for every column so the UI shows
      // the panels animating while cells stream in.
      if (workflow) {
        const seeded: Record<string, QuestionResult> = {};
        for (const col of workflow.columns) {
          seeded[col.prompt] = { answer: "", citations: [], status: "loading" };
        }
        setScanResults(seeded);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [dealId, workflowId, workflow]);

  // Extract structured findings from the latest run's cells. Pure derived
  // state — recomputes whenever the run changes. The brief's findings panel
  // reads from here; the parent useFindings hook is fed via the
  // onFindingsExtracted callback in the dashboard body.
  const findings: Finding[] = useMemo(() => {
    if (!run || !workflow) return [];
    return extractFindingsFromRun(run.cells, workflow.columns);
  }, [run, workflow]);

  return {
    workflow,
    run,
    scanWorkstream: workflowToScanShim(workflow),
    scanResults,
    findings,
    refresh,
    refreshing,
    error,
  };
}
