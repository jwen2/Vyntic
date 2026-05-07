/**
 * Workflows API client.
 *  - Phase 1: workflow template CRUD.
 *  - Phase 2: tabular runs + per-cell streaming.
 *
 * Mirrors Pydantic schemas in backend/app/models/workflow.py and workflow_run.py.
 */
import { getAuthToken, type Citation } from "./api";
import type { ColumnFormat } from "./matrixColumnConfig";

const API_BASE = "/api";

export type WorkflowType = "assistant" | "tabular";
export type RowSource = "one_doc_per_row" | "multi_doc_synthesis";
export type OutputFormat = "word" | "markdown" | "excel";

export interface WorkflowStage {
  id: string;
  order_index: number;
  label: string;
  prompt_md: string;
  checkpoint: boolean;
}

export interface WorkflowColumn {
  id: string;
  order_index: number;
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags?: string[] | null;
  is_derived: boolean;
  formula?: string | null;
}

export interface WorkflowVariable {
  id: string;
  key: string;
  default_value: string | null;
}

export interface Workflow {
  id: string;
  deal_id: string | null;
  name: string;
  description: string;
  type: WorkflowType;
  row_source: RowSource;
  output_format: OutputFormat;
  is_builtin: boolean;
  cloned_from: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  stages: WorkflowStage[];
  columns: WorkflowColumn[];
  variables: WorkflowVariable[];
}

export interface WorkflowStageInput {
  id?: string;
  order_index: number;
  label: string;
  prompt_md: string;
  checkpoint: boolean;
}

export interface WorkflowColumnInput {
  id?: string;
  order_index: number;
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags?: string[] | null;
  is_derived?: boolean;
  formula?: string | null;
}

export interface WorkflowVariableInput {
  id?: string;
  key: string;
  default_value?: string | null;
}

export interface WorkflowCreatePayload {
  name: string;
  description?: string;
  type: WorkflowType;
  row_source?: RowSource;
  output_format?: OutputFormat;
  stages?: WorkflowStageInput[];
  columns?: WorkflowColumnInput[];
  variables?: WorkflowVariableInput[];
}

export interface WorkflowUpdatePayload {
  name?: string;
  description?: string;
  row_source?: RowSource;
  output_format?: OutputFormat;
  stages?: WorkflowStageInput[];
  columns?: WorkflowColumnInput[];
  variables?: WorkflowVariableInput[];
}

async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...options, headers });
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listWorkflows(dealId: string): Promise<Workflow[]> {
  const res = await authedFetch(`${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows`);
  return unwrap<Workflow[]>(res);
}

export async function getWorkflow(dealId: string, workflowId: string): Promise<Workflow> {
  const res = await authedFetch(
    `${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}`
  );
  return unwrap<Workflow>(res);
}

export async function createWorkflow(
  dealId: string,
  payload: WorkflowCreatePayload
): Promise<Workflow> {
  const res = await authedFetch(`${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return unwrap<Workflow>(res);
}

export async function updateWorkflow(
  dealId: string,
  workflowId: string,
  payload: WorkflowUpdatePayload
): Promise<Workflow> {
  const res = await authedFetch(
    `${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
  return unwrap<Workflow>(res);
}

export async function deleteWorkflow(dealId: string, workflowId: string): Promise<void> {
  const res = await authedFetch(
    `${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function cloneWorkflow(dealId: string, workflowId: string): Promise<Workflow> {
  const res = await authedFetch(
    `${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/clone`,
    { method: "POST" }
  );
  return unwrap<Workflow>(res);
}

// ── Phase 2/3: Run + cell + stage types ──

// Phase 3 adds "checkpoint" — assistant runs sit here while waiting on human approval.
export type RunStatus =
  | "pending"
  | "running"
  | "checkpoint"
  | "complete"
  | "cancelled"
  | "error";
export type CellStatus = "queued" | "running" | "complete" | "error";
export type StageOutputStatus =
  | "queued"
  | "running"
  | "checkpoint"
  | "complete"
  | "error";

export interface TabularCell {
  id: string;
  run_id: string;
  row_key: string; // doc_id today
  column_id: string;
  status: CellStatus;
  answer: string;
  /** Format-parsed value (number, bool, list, {amount,currency}, etc.) — null on parse failure. */
  answer_formatted: unknown;
  citations: (Citation | null)[];
  model: string;
  fallback: boolean;
  duration_ms: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface AssistantStageOutput {
  id: string;
  run_id: string;
  stage_id: string | null;
  order_index: number;
  label: string;
  prompt_md: string;
  checkpoint: boolean;
  status: StageOutputStatus;
  output_md: string;
  edited_md: string | null;
  citations: (Citation | null)[];
  model: string;
  fallback: boolean;
  duration_ms: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  deal_id: string;
  run_number: number;
  status: RunStatus;
  document_ids: string[];
  started_by: number | null;
  started_at: string;
  completed_at: string | null;
  /** Populated for tabular runs. */
  cells: TabularCell[];
  /** Populated for assistant runs. */
  stage_outputs: AssistantStageOutput[];
}

export interface RunStreamSnapshot {
  type: "snapshot";
  run: WorkflowRun;
}

export interface RunStreamCellEvent {
  type: "cell";
  cell: TabularCell;
}

export interface RunStreamStageEvent {
  type: "stage";
  stage: AssistantStageOutput;
}

export interface RunStreamRunEvent {
  type: "run";
  run_id: string;
  status: RunStatus;
}

export type RunStreamEvent =
  | RunStreamSnapshot
  | RunStreamCellEvent
  | RunStreamStageEvent
  | RunStreamRunEvent;

// ── Phase 2: Run API ──

export async function startWorkflowRun(
  dealId: string,
  workflowId: string,
  documentIds: string[],
  synthesisQuestions: string[] = []
): Promise<WorkflowRun> {
  const res = await authedFetch(
    `${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/runs`,
    {
      method: "POST",
      body: JSON.stringify({
        document_ids: documentIds,
        synthesis_questions: synthesisQuestions,
      }),
    }
  );
  return unwrap<WorkflowRun>(res);
}

export async function listRuns(dealId: string, workflowId: string): Promise<WorkflowRun[]> {
  const res = await authedFetch(
    `${API_BASE}/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/runs`
  );
  return unwrap<WorkflowRun[]>(res);
}

export async function getRun(runId: string): Promise<WorkflowRun> {
  const res = await authedFetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`);
  return unwrap<WorkflowRun>(res);
}

export async function cancelRun(runId: string): Promise<WorkflowRun> {
  const res = await authedFetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
  return unwrap<WorkflowRun>(res);
}

export async function downloadRunExport(
  runId: string,
  format: "xlsx" | "docx"
): Promise<void> {
  const res = await authedFetch(
    `${API_BASE}/runs/${encodeURIComponent(runId)}/export.${format}`
  );
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] ?? `workflow-run.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Approve a checkpointed assistant stage and resume the run. */
export async function approveStage(
  runId: string,
  stageOutputId: string,
  editedMd?: string
): Promise<AssistantStageOutput> {
  const res = await authedFetch(
    `${API_BASE}/runs/${encodeURIComponent(runId)}/stages/${encodeURIComponent(stageOutputId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ edited_md: editedMd ?? null }),
    }
  );
  return unwrap<AssistantStageOutput>(res);
}

/**
 * Subscribe to a run's SSE event stream. Returns a cleanup function that
 * closes the EventSource. Token is passed via `?token=` since EventSource
 * cannot set Authorization headers.
 */
export function subscribeRun(
  runId: string,
  onEvent: (event: RunStreamEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const token = getAuthToken();
  const url = new URL(`${API_BASE}/runs/${encodeURIComponent(runId)}/stream`, window.location.origin);
  if (token) url.searchParams.set("token", token);
  const source = new EventSource(url.toString());
  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as RunStreamEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed events
    }
  };
  if (onError) source.onerror = onError;
  return () => source.close();
}
