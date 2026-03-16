const API_BASE = "/api";

export interface Deal {
  deal_id: string;
  name: string;
  description: string;
  document_count: number;
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
