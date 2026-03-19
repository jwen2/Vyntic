const API_BASE = "/api";

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
}

export interface CellData {
  answer: string;
  citations: Citation[];
  status: "pending" | "loading" | "complete" | "error";
}

export interface MatrixResponse {
  cells: Record<string, Record<string, CellData>>;
}

export async function createDeal(
  deal_id: string,
  name: string,
  description: string = ""
): Promise<Deal> {
  const res = await fetch(`${API_BASE}/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal_id, name, description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDeals(): Promise<Deal[]> {
  const res = await fetch(`${API_BASE}/deals`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDeal(deal_id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/deals/${deal_id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function uploadDocument(
  deal_id: string,
  file: File
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/deals/${deal_id}/documents`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function uploadDocumentsBatch(
  deal_id: string,
  files: File[]
): Promise<DocumentMetadata[]> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const res = await fetch(`${API_BASE}/deals/${deal_id}/documents/batch`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateDeal(
  deal_id: string,
  data: { name?: string; description?: string; stage?: string; tags?: string[] }
): Promise<Deal> {
  const res = await fetch(`${API_BASE}/deals/${deal_id}`, {
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

export async function deleteDocument(
  deal_id: string,
  doc_id: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/deals/${deal_id}/documents/${doc_id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function listDocuments(
  deal_id: string
): Promise<DocumentMetadata[]> {
  const res = await fetch(`${API_BASE}/deals/${deal_id}/documents`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function matrixCompare(
  deal_ids: string[],
  queries: string[]
): Promise<MatrixResponse> {
  const res = await fetch(`${API_BASE}/matrix/compare`, {
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
  citations: Citation[];
}

export interface StreamErrorEvent {
  type: "error";
  deal_id: string;
  query: string;
  error: string;
}

export type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;

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
      const res = await fetch(`${API_BASE}/matrix/compare/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
