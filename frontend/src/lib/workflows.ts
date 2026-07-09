/**
 * Workflows API client.
 *  - Phase 1: workflow template CRUD.
 *  - Phase 2: tabular runs + per-cell streaming.
 *
 * Mirrors Pydantic schemas in backend/app/models/workflow.py and workflow_run.py.
 */
import { request, requestRaw, type Citation } from "./api";
import type { ColumnFormat } from "./matrixColumnConfig";

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

export async function listWorkflows(dealId: string): Promise<Workflow[]> {
  return request<Workflow[]>(`/deals/${encodeURIComponent(dealId)}/workflows`);
}

export async function getWorkflow(dealId: string, workflowId: string): Promise<Workflow> {
  return request<Workflow>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}`
  );
}

export async function createWorkflow(
  dealId: string,
  payload: WorkflowCreatePayload
): Promise<Workflow> {
  return request<Workflow>(`/deals/${encodeURIComponent(dealId)}/workflows`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWorkflow(
  dealId: string,
  workflowId: string,
  payload: WorkflowUpdatePayload
): Promise<Workflow> {
  return request<Workflow>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
}

export async function deleteWorkflow(dealId: string, workflowId: string): Promise<void> {
  await request<void>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}`,
    { method: "DELETE" }
  );
}

export interface WorkflowColumnPatch {
  label?: string;
  prompt?: string;
  format?: ColumnFormat;
  tags?: string[] | null;
}

export async function patchWorkflowColumn(
  dealId: string,
  workflowId: string,
  columnId: string,
  patch: WorkflowColumnPatch
): Promise<WorkflowColumn> {
  return request<WorkflowColumn>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/columns/${encodeURIComponent(columnId)}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

export async function cloneWorkflow(dealId: string, workflowId: string): Promise<Workflow> {
  return request<Workflow>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/clone`,
    { method: "POST" }
  );
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

export interface Caveat {
  text: string;
  severity: "info" | "warn" | "risk";
  citation_ids?: string[];
}

export interface ListItem {
  text: string;
  citation_ids?: string[];
}

export type TypedCellValue =
  | { value: number; unit?: string | null; period?: string | null; raw?: string | null }
  | { iso: string; granularity: "day" | "month" | "quarter" | "year" }
  | { value: boolean }
  | { value: string; allowed?: string[] }
  | { summary: string; body: string; caveats: Caveat[] }
  | { items: ListItem[]; ordered: boolean }
  | { pairs: Array<{ key: string; value: string | number; unit?: string | null }> };

export interface CellQuality {
  coverage: number;
  agreement?: "match" | "diff";
  hallucination_risk: "low" | "med" | "high";
}

export interface TabularCell {
  id: string;
  run_id: string;
  row_key: string; // doc_id today
  column_id: string;
  status: CellStatus;
  answer: string;
  /** Format-parsed value. New typed-cell shapes use object values; legacy formats may still be scalar/list. */
  answer_formatted: TypedCellValue | string | number | boolean | string[] | unknown[] | Record<string, unknown> | null;
  citations: (Citation | null)[];
  quality?: CellQuality | null;
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
  return request<WorkflowRun>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/runs`,
    {
      method: "POST",
      body: JSON.stringify({
        document_ids: documentIds,
        synthesis_questions: synthesisQuestions,
      }),
    }
  );
}

export async function listRuns(dealId: string, workflowId: string): Promise<WorkflowRun[]> {
  return request<WorkflowRun[]>(
    `/deals/${encodeURIComponent(dealId)}/workflows/${encodeURIComponent(workflowId)}/runs`
  );
}

export async function getRun(runId: string): Promise<WorkflowRun> {
  return request<WorkflowRun>(`/runs/${encodeURIComponent(runId)}`);
}

export async function retryCell(runId: string, cellId: string): Promise<TabularCell> {
  return request<TabularCell>(
    `/runs/${encodeURIComponent(runId)}/cells/${encodeURIComponent(cellId)}/retry`,
    { method: "POST" }
  );
}

export async function retryColumn(
  runId: string,
  columnId: string
): Promise<{ requeued: number }> {
  return request<{ requeued: number }>(
    `/runs/${encodeURIComponent(runId)}/columns/${encodeURIComponent(columnId)}/retry`,
    { method: "POST" }
  );
}

export async function cancelRun(runId: string): Promise<WorkflowRun> {
  return request<WorkflowRun>(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
}

export async function downloadRunExport(
  runId: string,
  format: "xlsx" | "docx"
): Promise<void> {
  const res = await requestRaw(`/runs/${encodeURIComponent(runId)}/export.${format}`);
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
  return request<AssistantStageOutput>(
    `/runs/${encodeURIComponent(runId)}/stages/${encodeURIComponent(stageOutputId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ edited_md: editedMd ?? null }),
    }
  );
}

/**
 * Subscribe to a run's SSE event stream. Returns a cleanup function that
 * closes the EventSource. EventSource cannot set Authorization headers, so
 * we first mint a short-lived token scoped to exactly this run's stream and
 * pass that via `?token=` — never the session JWT (it would land in server
 * logs and browser history).
 */
export function subscribeRun(
  runId: string,
  onEvent: (event: RunStreamEvent) => void,
  onError?: (err: Event) => void
): () => void {
  let source: EventSource | null = null;
  let closed = false;

  (async () => {
    try {
      const { token } = await request<{ token: string }>(
        `/runs/${encodeURIComponent(runId)}/stream-token`
      );
      if (closed) return;
      const url = new URL(
        `/api/runs/${encodeURIComponent(runId)}/stream`,
        window.location.origin
      );
      url.searchParams.set("token", token);
      source = new EventSource(url.toString());
      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RunStreamEvent;
          onEvent(parsed);
        } catch {
          // ignore malformed events
        }
      };
      if (onError) source.onerror = onError;
    } catch {
      onError?.(new Event("error"));
    }
  })();

  return () => {
    closed = true;
    source?.close();
  };
}
