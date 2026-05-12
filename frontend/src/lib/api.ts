const API_BASE = "/api";
const TOKEN_KEY = "vyntic_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearAuthToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function fetchWrapper(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
}
export const SYNTHESIS_DEAL_ID = "__synthesis__";

export interface Deal {
  deal_id: string;
  name: string;
  description: string;
  document_count: number;
  stage: string;
  tags: string[];
}

export interface Citation {
  source_file: string;
  page: number;
  text_snippet: string;
  deal_id?: string;
  kind?: "extracted" | "derived";
  span_label?: string | null;
}

export interface CellData {
  answer: string;
  citations: (Citation | null)[];
  status: "pending" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

export interface MatrixResponse {
  cells: Record<string, Record<string, CellData>>;
}

// ── Conversation History ──

export interface ConversationEntry {
  id: string;
  deal_id: string;
  question: string;
  answer: string;
  citations: (Citation | null)[];
  workstream: string;
  created_at: string;
}

export async function listConversations(
  deal_id: string,
  workstream?: string
): Promise<ConversationEntry[]> {
  const params = workstream ? `?workstream=${encodeURIComponent(workstream)}` : "";
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}/conversations${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveConversation(
  deal_id: string,
  data: { question: string; answer: string; citations?: (Citation | null)[]; workstream?: string }
): Promise<ConversationEntry> {
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal_id, ...data }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDeal(
  deal_id: string,
  name: string,
  description: string = ""
): Promise<Deal> {
  const res = await fetchWrapper(`${API_BASE}/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal_id, name, description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDeals(): Promise<Deal[]> {
  const res = await fetchWrapper(`${API_BASE}/deals`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDeal(deal_id: string): Promise<void> {
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export interface UploadProgress {
  upload_id: string;
  status: "uploading" | "processing" | "complete" | "error";
  stage: string;
  percent: number;
  filename?: string | null;
  detail?: string;
}

interface UploadOptions {
  uploadId?: string;
  onUploadProgress?: (percent: number) => void;
}

function xhrUpload<T>(
  url: string,
  form: FormData,
  options: UploadOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    const token = getAuthToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onUploadProgress) return;
      options.onUploadProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearAuthToken();
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        reject(new Error("Not authenticated"));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
        return;
      }

      if (!xhr.responseText) {
        resolve(undefined as T);
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        resolve(xhr.responseText as T);
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
}

export async function uploadDocument(
  deal_id: string,
  file: File,
  options: UploadOptions = {}
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const params = options.uploadId ? `?upload_id=${encodeURIComponent(options.uploadId)}` : "";
  await xhrUpload<DocumentMetadata>(
    `${API_BASE}/deals/${deal_id}/documents${params}`,
    form,
    options
  );
}

export async function uploadDocumentsBatch(
  deal_id: string,
  files: File[],
  options: UploadOptions = {}
): Promise<DocumentMetadata[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const params = options.uploadId ? `?upload_id=${encodeURIComponent(options.uploadId)}` : "";
  return xhrUpload<DocumentMetadata[]>(
    `${API_BASE}/deals/${deal_id}/documents/batch${params}`,
    form,
    options
  );
}

export async function updateDeal(
  deal_id: string,
  data: { name?: string; description?: string; stage?: string; tags?: string[] }
): Promise<Deal> {
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface DocumentMetadata {
  doc_id: string;
  deal_id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
}

export async function getUploadProgress(
  deal_id: string,
  uploadId: string
): Promise<UploadProgress> {
  const res = await fetchWrapper(
    `${API_BASE}/deals/${deal_id}/documents/progress/${encodeURIComponent(uploadId)}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDocument(
  deal_id: string,
  doc_id: string
): Promise<void> {
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}/documents/${doc_id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function listDocuments(
  deal_id: string
): Promise<DocumentMetadata[]> {
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}/documents`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function matrixCompare(
  deal_ids: string[],
  queries: string[]
): Promise<MatrixResponse> {
  const res = await fetchWrapper(`${API_BASE}/matrix/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal_ids, queries }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Streaming SSE API ──

export interface StreamTokenEvent {
  type: "token";
  deal_id: string;
  query: string;
  token: string;
}

export interface StreamDoneEvent {
  type: "done";
  deal_id: string;
  query: string;
  answer: string;
  citations: (Citation | null)[];
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

export interface StreamErrorEvent {
  type: "error";
  deal_id: string;
  query: string;
  error: string;
}

export type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;

// ── Workstream SSE events (question-keyed instead of query-keyed) ──

export interface WorkstreamTokenEvent {
  type: "token";
  deal_id: string;
  question: string;
  token: string;
}

export interface WorkstreamDoneEvent {
  type: "done";
  deal_id: string;
  question: string;
  answer: string;
  citations: (Citation | null)[];
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

export interface WorkstreamErrorEvent {
  type: "error";
  deal_id: string;
  question: string;
  error: string;
}

export type WorkstreamEvent =
  | WorkstreamTokenEvent
  | WorkstreamDoneEvent
  | WorkstreamErrorEvent;

/**
 * Opens a streaming SSE connection to the matrix compare endpoint.
 * Calls onEvent for each parsed SSE event (token, done, error).
 * Returns an AbortController so the caller can cancel.
 */
export function matrixCompareStream(
  deal_ids: string[],
  queries: string[],
  onEvent: (event: StreamEvent) => void,
  onFinish?: () => void,
  onError?: (err: Error) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/matrix/compare/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({ deal_ids, queries }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        onError?.(new Error(text));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError?.(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines: "data: {...}\n\n"
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(trimmed.slice(6)) as StreamEvent;
            onEvent(event);
          } catch {
            // skip malformed
          }
        }
      }

      onFinish?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}

/**
 * Opens a streaming SSE connection to run a workstream against a single deal.
 * Calls onEvent for each parsed SSE event (token, done, error).
 * Returns an AbortController so the caller can cancel.
 */
export function workstreamStream(
  dealId: string,
  workstream: string,
  questions: string[],
  onEvent: (event: WorkstreamEvent) => void,
  onFinish?: () => void,
  onError?: (err: Error) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE}/deals/${dealId}/workstream/stream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ workstream, questions }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        onError?.(new Error(text));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError?.(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(trimmed.slice(6)) as WorkstreamEvent;
            onEvent(event);
          } catch {
            // skip malformed
          }
        }
      }

      onFinish?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}

// ── Sweep SSE events (proactive scan) ──

export interface SweepMetaEvent {
  type: "sweep_meta";
  deal_id: string;
  total_chunks: number;
  total_questions: number;
}

export interface SweepDoneEvent {
  type: "sweep_done";
  deal_id: string;
  model: string;
  fallback: boolean;
  duration_ms: number;
}

export type SweepEvent = WorkstreamEvent | SweepMetaEvent | SweepDoneEvent;

/**
 * Opens a streaming SSE connection to run a proactive sweep scan on a deal.
 * Unlike workstream queries, the sweep scans ALL document chunks.
 * Returns an AbortController so the caller can cancel.
 */
export function sweepStream(
  dealId: string,
  questions: string[],
  onEvent: (event: SweepEvent) => void,
  onFinish?: () => void,
  onError?: (err: Error) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE}/deals/${dealId}/sweep/stream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ questions }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        onError?.(new Error(text));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError?.(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(trimmed.slice(6)) as SweepEvent;
            onEvent(event);
          } catch {
            // skip malformed
          }
        }
      }

      onFinish?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}

// ── Doc-Matrix SSE events (doc_id keyed) ──

export interface DocMatrixTokenEvent {
  type: "token";
  doc_id: string;
  query: string;
  token: string;
}

export interface DocMatrixDoneEvent {
  type: "done";
  doc_id: string;
  query: string;
  answer: string;
  citations: (Citation | null)[];
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

export interface DocMatrixErrorEvent {
  type: "error";
  doc_id: string;
  query: string;
  error: string;
}

export type DocMatrixEvent =
  | DocMatrixTokenEvent
  | DocMatrixDoneEvent
  | DocMatrixErrorEvent;

/**
 * Opens a streaming SSE connection to run a prompt against individual documents.
 * Each document gets its own streaming response.
 * Returns an AbortController so the caller can cancel.
 */
export function docMatrixStream(
  dealId: string,
  docIds: string[],
  query: string,
  onEvent: (event: DocMatrixEvent) => void,
  onFinish?: () => void,
  onError?: (err: Error) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE}/deals/${dealId}/doc-matrix/stream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ doc_ids: docIds, query }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        onError?.(new Error(text));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError?.(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const raw = JSON.parse(trimmed.slice(6));
            // Derive event type from backend payload shape
            let event: DocMatrixEvent;
            if (raw.error) {
              event = { type: "error", doc_id: raw.doc_id, query: "", error: raw.error };
            } else if (raw.done) {
              event = {
                type: "done",
                doc_id: raw.doc_id,
                query: "",
                answer: raw.answer,
                citations: raw.citations || [],
                model: raw.model,
                fallback: raw.fallback,
                duration_ms: raw.duration_ms,
              };
            } else {
              event = { type: "token", doc_id: raw.doc_id, query: "", token: raw.token };
            }
            onEvent(event);
          } catch {
            // skip malformed
          }
        }
      }

      onFinish?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}

// ── IC Report Generation ──

export interface ReportCitation {
  source_file: string;
  page: number;
  text_snippet: string;
}

export interface ReportQuestion {
  label: string;
  question: string;
  answer: string;
  citations: ReportCitation[];
}

export interface ReportWorkstream {
  workstream_id: string;
  workstream_name: string;
  questions: ReportQuestion[];
}

export interface ReportDeal {
  deal_id: string;
  name: string;
  stage?: string;
  tags?: string[];
  document_count?: number;
  workstreams: ReportWorkstream[];
}

export interface ICReportRequest {
  title?: string;
  deals: ReportDeal[];
}

export async function generateICReport(request: ICReportRequest): Promise<void> {
  const res = await fetchWrapper(`${API_BASE}/reports/ic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  // Extract filename from Content-Disposition header
  const disposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] || "IC-Report.docx";

  // Download the blob
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Stream a single question against a deal with optional workstream context.
 */
export function singleQuestionStream(
  dealId: string,
  question: string,
  workstream: string,
  onEvent: (event: WorkstreamEvent) => void,
  onFinish?: () => void,
  onError?: (err: Error) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE}/deals/${dealId}/workstream/query/stream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ question, workstream }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        onError?.(new Error(text));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError?.(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(trimmed.slice(6)) as WorkstreamEvent;
            onEvent(event);
          } catch {
            // skip malformed
          }
        }
      }

      onFinish?.();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    }
  })();

  return controller;
}

// ── Authentication API ──

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_admin: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  setAuthToken(data.access_token);
  return data;
}

export async function register(email: string, password: string, full_name: string = ""): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  setAuthToken(data.access_token);
  return data;
}

export async function getMe(): Promise<User> {
  const res = await fetchWrapper(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

