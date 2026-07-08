const API_BASE = "/api";
const TOKEN_KEY = "vyntic_auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
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
    if (window.location.pathname !== "/login") {
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
  entity_type: "deal" | "fund";
  manager_id: string | null;
  manager_name: string | null;
  vintage: number | null;
  strategy: string;
}

export const DEAL_STAGES = ["Screening", "Due Diligence", "IC Review", "Closed"];
export const FUND_STAGES = [
  "Screening",
  "Diligence",
  "IC",
  "Committed",
  "Monitoring",
  "Re-up review",
];

export function stagesForEntity(entityType: string): string[] {
  return entityType === "fund" ? FUND_STAGES : DEAL_STAGES;
}

export const DOC_CATEGORIES = [
  "ddq",
  "ppm",
  "lpa",
  "side_letter",
  "track_record",
  "pitchbook",
  "quarterly_report",
  "capital_account",
  "capital_call",
  "distribution_notice",
  "financial_statements",
  "form_adv",
  "valuation_policy",
  "other",
];

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  ddq: "DDQ",
  ppm: "PPM",
  lpa: "LPA",
  side_letter: "Side letter",
  track_record: "Track record",
  pitchbook: "Pitchbook",
  quarterly_report: "Quarterly report",
  capital_account: "Capital account",
  capital_call: "Capital call",
  distribution_notice: "Distribution notice",
  financial_statements: "Financial statements",
  form_adv: "Form ADV",
  valuation_policy: "Valuation policy",
  other: "Other",
};

// ── Managers (GP firms) ──

export interface Manager {
  manager_id: string;
  name: string;
  description: string;
  tags: string[];
  fund_count: number;
}

export async function listManagers(): Promise<Manager[]> {
  const res = await fetchWrapper(`${API_BASE}/managers`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createManager(
  manager_id: string,
  name: string,
  description: string = ""
): Promise<Manager> {
  const res = await fetchWrapper(`${API_BASE}/managers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manager_id, name, description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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

/** Pagination envelope returned by list endpoints (Plan 4 C2). The list
 * helpers below unwrap `.items` so callers keep array semantics; paging
 * UI can consume `total`/`next_offset` when it lands (frontend plan F2). */
export interface Page<T> {
  items: T[];
  total: number;
  next_offset: number | null;
}

export async function listConversations(
  deal_id: string,
  workstream?: string
): Promise<ConversationEntry[]> {
  const params = workstream ? `?workstream=${encodeURIComponent(workstream)}` : "";
  const res = await fetchWrapper(`${API_BASE}/deals/${deal_id}/conversations${params}`);
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as Page<ConversationEntry>).items;
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

export interface CreateDealPayload {
  deal_id: string;
  name: string;
  description?: string;
  stage?: string;
  entity_type?: "deal" | "fund";
  manager_id?: string | null;
  vintage?: number | null;
  strategy?: string;
}

export async function createDeal(payload: CreateDealPayload): Promise<Deal> {
  const res = await fetchWrapper(`${API_BASE}/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDeals(): Promise<Deal[]> {
  const res = await fetchWrapper(`${API_BASE}/deals`);
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as Page<Deal>).items;
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
        if (window.location.pathname !== "/login") {
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
  data: {
    name?: string;
    description?: string;
    stage?: string;
    tags?: string[];
    manager_id?: string;
    vintage?: number;
    strategy?: string;
  }
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
  doc_category: string;
  period: string | null;
  scope: "entity" | "manager";
}

export async function updateDocumentMetadata(
  deal_id: string,
  doc_id: string,
  data: { doc_category?: string; period?: string; scope?: "entity" | "manager" }
): Promise<DocumentMetadata> {
  const res = await fetchWrapper(
    `${API_BASE}/deals/${deal_id}/documents/${doc_id}/metadata`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
  return ((await res.json()) as Page<DocumentMetadata>).items;
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

/**
 * Opens a streaming SSE connection to the matrix compare endpoint (deal
 * comparison view). Calls onEvent for each parsed SSE event (token, done,
 * error). Returns an AbortController so the caller can cancel.
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

// ── Query stream events (used by the Agent chat surface) ──

export interface QueryStreamTokenEvent {
  type: "token";
  deal_id: string;
  question: string;
  token: string;
}

export interface QueryStreamDoneEvent {
  type: "done";
  deal_id: string;
  question: string;
  answer: string;
  citations: (Citation | null)[];
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

export interface QueryStreamErrorEvent {
  type: "error";
  deal_id: string;
  question: string;
  error: string;
}

export type QueryStreamEvent =
  | QueryStreamTokenEvent
  | QueryStreamDoneEvent
  | QueryStreamErrorEvent;

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

/**
 * Stream a single question against a deal. Used by the Agent chat surface.
 */
export function singleQuestionStream(
  dealId: string,
  question: string,
  onEvent: (event: QueryStreamEvent) => void,
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
        `${API_BASE}/deals/${dealId}/query/stream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ question }),
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
            const event = JSON.parse(trimmed.slice(6)) as QueryStreamEvent;
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

export async function logout(): Promise<void> {
  // Revoke the token server-side before clearing it locally; best-effort —
  // a failed call must not trap the user in a logged-in state.
  try {
    await fetchWrapper(`${API_BASE}/auth/logout`, { method: "POST" });
  } catch {
    // ignore
  }
  clearAuthToken();
}

/**
 * Mint a short-lived token scoped to viewing one document. Used for the
 * viewer iframe URL, where the browser cannot send an Authorization header.
 */
export async function getDocumentViewToken(
  deal_id: string,
  filename: string
): Promise<string> {
  const res = await fetchWrapper(
    `${API_BASE}/deals/${encodeURIComponent(deal_id)}/documents/${encodeURIComponent(filename)}/view-token`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.token;
}

