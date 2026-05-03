const pythonBase = (process.env.PYTHON_API_BASE || "http://localhost:8000").replace(/\/$/, "");

export type DealDocument = {
    doc_id: string;
    filename: string;
    file_type: string;
    page_count: number;
    chunk_count: number;
};

export type FullTextResponse = {
    markdown: string;
    page_count: number;
};

export type SearchResult = {
    doc_id: string;
    filename: string;
    page: number;
    snippet: string;
    section_type: string;
    score: number;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = process.env.INTERNAL_API_TOKEN || "";
    const headers = new Headers(init.headers);
    headers.set("X-Internal-Token", token);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const resp = await fetch(`${pythonBase}${path}`, { ...init, headers });
    if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Python API ${resp.status}: ${detail}`);
    }
    return (await resp.json()) as T;
}

export const pythonClient = {
    async checkDealAccess(dealId: string, userId: string): Promise<{ has_access: boolean; role: string | null }> {
        return request(`/internal/deals/${encodeURIComponent(dealId)}/access?user_id=${encodeURIComponent(userId)}`);
    },

    async listDocuments(dealId: string): Promise<DealDocument[]> {
        return request(`/internal/deals/${encodeURIComponent(dealId)}/documents`);
    },

    async getDocumentFullText(docId: string): Promise<FullTextResponse> {
        return request(`/internal/documents/${encodeURIComponent(docId)}/full_text`);
    },

    async getDocumentPages(docId: string, pages: number[]): Promise<{ markdown: string }> {
        const params = new URLSearchParams();
        params.set("pages", pages.join(","));
        return request(`/internal/documents/${encodeURIComponent(docId)}/pages?${params.toString()}`);
    },

    async search(dealId: string, query: string, k: number): Promise<SearchResult[]> {
        return request(`/internal/deals/${encodeURIComponent(dealId)}/search`, {
            method: "POST",
            body: JSON.stringify({ query, k }),
        });
    },

    async searchDocument(docId: string, query: string, k: number): Promise<SearchResult[]> {
        return request(`/internal/documents/${encodeURIComponent(docId)}/search`, {
            method: "POST",
            body: JSON.stringify({ query, k }),
        });
    },
};
