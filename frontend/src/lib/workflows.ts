/**
 * Workflows API client (Phase 1: templates only).
 * Mirrors the Pydantic schemas in backend/app/models/workflow.py.
 *
 * Run/cell/stage-output endpoints land in Phase 2/3.
 */
import { getAuthToken } from "./api";
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
