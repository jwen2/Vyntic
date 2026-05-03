import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { db, nowIso } from "../lib/db";
import { DEFAULT_TABULAR_MODEL, FALLBACK_MODEL } from "../lib/llm";
import { streamChatWithTools, completeText, type UserApiKeys } from "../lib/llm";
import { formatPromptSuffix } from "../lib/columnFormats";
import { DONE, setupSse, sse } from "../lib/sse";
import { pythonClient, type DealDocument, type SearchResult } from "../lib/pythonClient";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

type MatrixColumn = {
    index: number;
    name: string;
    prompt: string;
    format?: string;
    tags?: string[];
};

type CellResult = {
    summary: string;
    flag: "green" | "grey" | "yellow" | "red";
    reasoning: string;
};

type MatrixRow = {
    id: string;
    deal_id: string;
    user_id: string;
    name: string;
    columns_json: string;
    document_ids_json: string;
    created_at: string;
    updated_at: string;
};

export const matrixRouter = Router();

function apiKeys(): UserApiKeys {
    return { gemini: process.env.GEMINI_API_KEY || null };
}

function normalizeFormat(format?: string): string | undefined {
    switch (format) {
        case "list":
            return "bulleted_list";
        case "%":
            return "percentage";
        case "$":
            return "monetary_amount";
        case "yes-no":
            return "yes_no";
        default:
            return format || undefined;
    }
}

function normalizeColumns(raw: unknown): MatrixColumn[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((col, i) => {
        const c = col as Record<string, unknown>;
        return {
            index: typeof c.index === "number" ? c.index : i,
            name: String(c.name || `Column ${i + 1}`),
            prompt: String(c.prompt || c.name || ""),
            format: normalizeFormat(typeof c.format === "string" ? c.format : undefined),
            tags: Array.isArray(c.tags) ? c.tags.map(String) : undefined,
        };
    });
}

function parseJson<T>(value: string, fallback: T): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

async function ensureDealAccess(dealId: string, userId: string): Promise<void> {
    const access = await pythonClient.checkDealAccess(dealId, userId);
    if (!access.has_access) {
        throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
}

function getMatrix(id: string): MatrixRow | null {
    return (db.prepare("SELECT * FROM matrices WHERE id = ?").get(id) as MatrixRow | undefined) || null;
}

function serializeMatrix(row: MatrixRow) {
    return {
        id: row.id,
        deal_id: row.deal_id,
        user_id: row.user_id,
        name: row.name,
        columns: parseJson<MatrixColumn[]>(row.columns_json, []),
        document_ids: parseJson<string[]>(row.document_ids_json, []),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function upsertCell(
    matrixId: string,
    docId: string,
    columnIndex: number,
    status: string,
    content: CellResult | Record<string, unknown>,
    retrievalMode: "full_text" | "rag",
    error?: string,
): void {
    db.prepare(`
        INSERT INTO matrix_cells
            (matrix_id, doc_id, column_index, status, content_json, retrieval_mode, error, updated_at)
        VALUES
            (@matrixId, @docId, @columnIndex, @status, @contentJson, @retrievalMode, @error, @updatedAt)
        ON CONFLICT(matrix_id, doc_id, column_index) DO UPDATE SET
            status = excluded.status,
            content_json = excluded.content_json,
            retrieval_mode = excluded.retrieval_mode,
            error = excluded.error,
            updated_at = excluded.updated_at
    `).run({
        matrixId,
        docId,
        columnIndex,
        status,
        contentJson: JSON.stringify(content),
        retrievalMode,
        error: error || null,
        updatedAt: nowIso(),
    });
}

function sendCellUpdate(
    res: Response,
    documentId: string,
    columnIndex: number,
    content: CellResult | Record<string, unknown>,
    status: string,
    retrievalMode: "full_text" | "rag",
): void {
    res.write(sse("cell_update", {
        document_id: documentId,
        column_index: columnIndex,
        content,
        status,
        retrieval_mode: retrievalMode,
    }));
}

async function selectEvidence(
    _dealId: string,
    doc: DealDocument,
    columns: MatrixColumn[],
): Promise<{ markdown: string; mode: "full_text" | "rag" }> {
    const full = await pythonClient.getDocumentFullText(doc.doc_id);
    const charLimit = Number(process.env.MATRIX_FULL_TEXT_CHAR_LIMIT || 120000);
    const maxPages = Number(process.env.MATRIX_FULL_TEXT_MAX_PAGES || 80);
    if (full.markdown.length <= charLimit && full.page_count <= maxPages) {
        return { markdown: full.markdown, mode: "full_text" };
    }

    const topK = Number(process.env.MATRIX_RAG_TOP_K || 24);
    const query = columns
        .map((col) => `${col.name}: ${col.prompt}`)
        .join("\n");
    const hits = await pythonClient.searchDocument(doc.doc_id, query, topK);
    const pages = expandHitPages(hits, full.page_count || doc.page_count);
    if (pages.length > 0) {
        const pageText = await pythonClient.getDocumentPages(doc.doc_id, pages);
        if (pageText.markdown.trim()) {
            return { markdown: pageText.markdown.slice(0, charLimit), mode: "rag" };
        }
    }

    const fallbackEvidence = hits
        .map((hit) => `## Page ${hit.page || 1}\n\n${hit.snippet}`)
        .join("\n\n");
    return {
        markdown: (fallbackEvidence || full.markdown).slice(0, charLimit),
        mode: "rag",
    };
}

function expandHitPages(hits: SearchResult[], pageCount: number): number[] {
    const pages = new Set<number>();
    for (const hit of hits) {
        const page = Number(hit.page || 0);
        if (!page) continue;
        for (const candidate of [page - 1, page, page + 1]) {
            if (candidate >= 1 && (!pageCount || candidate <= pageCount)) {
                pages.add(candidate);
            }
        }
    }
    return [...pages].sort((a, b) => a - b).slice(0, 30);
}

async function queryGeminiAllColumns(
    model: string,
    filename: string,
    documentText: string,
    columns: MatrixColumn[],
    onResult: (columnIndex: number, result: CellResult) => Promise<void>,
    keys?: UserApiKeys,
): Promise<void> {
    const columnsDesc = columns
        .map((col) => {
            const suffix = formatPromptSuffix(col.format, col.tags);
            const fullPrompt = `${col.prompt}${suffix} If not found, state "Not Found".`;
            return `Column ${col.index} - "${col.name}": ${fullPrompt}`;
        })
        .join("\n");

    const system = `You are a private equity analyst. Extract information for each column listed below.

For each column, output exactly one minified JSON object on its own line (no line breaks inside the JSON), then a newline. Process columns in order and output each result as soon as you finish it.

Line format:
{"column_index": <N>, "summary": <string>, "flag": <"green"|"grey"|"yellow"|"red">, "reasoning": <string>}

Rules:
- "summary": the extracted value with inline citations [[page:N||quote:verbatim excerpt <=25 words]] after every factual claim. No explanation or reasoning here. Quotes must be narrowly scoped to the specific claim.
- "flag": green = standard/favorable, yellow = needs attention, red = problematic/unfavorable, grey = neutral/not found
- "reasoning": brief explanation of the extraction
- The "summary" and "reasoning" string VALUES may use markdown. Escape newlines as \\n inside the JSON string.
- Output ONLY the JSON lines themselves. Do NOT wrap the response in markdown code fences, and do not add any preamble or summary.`;

    const user = `Document: ${filename}\n\n${documentText.slice(0, 120_000)}\n\n---\nColumns to extract:\n${columnsDesc}`;
    let contentBuffer = "";
    const pending: Promise<unknown>[] = [];

    const processLine = async (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            const parsed = JSON.parse(trimmed) as {
                column_index?: unknown;
                summary?: unknown;
                flag?: unknown;
                reasoning?: unknown;
            };
            if (typeof parsed.column_index !== "number") return;
            const col = columns.find((c) => c.index === parsed.column_index);
            if (!col) return;
            await onResult(parsed.column_index, {
                summary: String(parsed.summary ?? "").trim() || "Not addressed",
                flag: (["green", "grey", "yellow", "red"] as const).includes(parsed.flag as "green")
                    ? (parsed.flag as CellResult["flag"])
                    : "grey",
                reasoning: String(parsed.reasoning ?? ""),
            });
        } catch {
            // Ignore malformed partial lines; the final fallback handles blanks.
        }
    };

    await streamChatWithTools({
        model,
        systemPrompt: system,
        messages: [{ role: "user", content: user }],
        tools: [],
        apiKeys: keys,
        callbacks: {
            onContentDelta: (delta) => {
                contentBuffer += delta;
                let newlineIdx: number;
                while ((newlineIdx = contentBuffer.indexOf("\n")) !== -1) {
                    const completedLine = contentBuffer.slice(0, newlineIdx);
                    contentBuffer = contentBuffer.slice(newlineIdx + 1);
                    pending.push(processLine(completedLine));
                }
            },
        },
    });

    if (contentBuffer.trim()) pending.push(processLine(contentBuffer));
    await Promise.all(pending);
}

async function querySingleCell(
    model: string,
    filename: string,
    documentText: string,
    column: MatrixColumn,
    keys?: UserApiKeys,
): Promise<CellResult | null> {
    const suffix = formatPromptSuffix(column.format, column.tags);
    const prompt = `${column.prompt}${suffix} If not found, state "Not Found". Leave all reasoning and explanation in the "reasoning" field only.`;
    const system = `You are a private equity analyst. Return ONLY valid JSON:
{"summary": string, "flag": "green"|"grey"|"yellow"|"red", "reasoning": string}

The "summary" field must contain only the extracted value with inline citations in the format [[page:N||quote:exact quoted text]]. Every factual claim must have a citation.`;

    const raw = await completeText({
        model,
        systemPrompt: system,
        user: `Document: ${filename}\n\n${documentText.slice(0, 120_000)}\n\n---\nInstruction: ${prompt}`,
        apiKeys: keys,
    });
    try {
        const parsed = JSON.parse(raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim()) as Partial<CellResult>;
        return {
            summary: String(parsed.summary || "").trim() || "Not addressed",
            flag: (["green", "grey", "yellow", "red"] as const).includes(parsed.flag as "green")
                ? (parsed.flag as CellResult["flag"])
                : "grey",
            reasoning: String(parsed.reasoning || ""),
        };
    } catch {
        return raw.trim()
            ? { summary: raw.trim().slice(0, 500), flag: "grey", reasoning: "" }
            : null;
    }
}

matrixRouter.get("/", requireAuth, async (req, res) => {
    try {
        const authed = req as AuthedRequest;
        const dealId = typeof req.query.deal_id === "string" ? req.query.deal_id : null;
        if (dealId) {
            await ensureDealAccess(dealId, authed.userId);
        }
        const rows = dealId
            ? db.prepare("SELECT * FROM matrices WHERE deal_id = ? ORDER BY created_at DESC").all(dealId)
            : db.prepare("SELECT * FROM matrices WHERE user_id = ? ORDER BY created_at DESC").all(authed.userId);
        res.json((rows as MatrixRow[]).map(serializeMatrix));
    } catch (err) {
        res.status((err as { statusCode?: number }).statusCode || 500).json({ detail: (err as Error).message });
    }
});

matrixRouter.post("/", requireAuth, async (req, res) => {
    try {
        const authed = req as AuthedRequest;
        const dealId = String(req.body?.deal_id || "");
        if (!dealId) return void res.status(400).json({ detail: "deal_id is required" });
        await ensureDealAccess(dealId, authed.userId);

        const docs = await pythonClient.listDocuments(dealId);
        const requestedDocIds: string[] = Array.isArray(req.body?.document_ids)
            ? (req.body.document_ids as unknown[]).map(String)
            : docs.map((doc) => doc.doc_id);
        const docIds = requestedDocIds.filter((id) => docs.some((doc) => doc.doc_id === id));
        const columns = normalizeColumns(req.body?.columns);
        const id = randomUUID();
        const timestamp = nowIso();
        db.prepare(`
            INSERT INTO matrices (id, deal_id, user_id, name, columns_json, document_ids_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            dealId,
            authed.userId,
            String(req.body?.name || "Untitled matrix"),
            JSON.stringify(columns),
            JSON.stringify(docIds),
            timestamp,
            timestamp,
        );
        res.status(201).json(serializeMatrix(getMatrix(id)!));
    } catch (err) {
        res.status((err as { statusCode?: number }).statusCode || 500).json({ detail: (err as Error).message });
    }
});

matrixRouter.get("/:id", requireAuth, async (req, res) => {
    try {
        const row = getMatrix(req.params.id);
        if (!row) return void res.status(404).json({ detail: "Matrix not found" });
        await ensureDealAccess(row.deal_id, (req as AuthedRequest).userId);
        const cells = db.prepare("SELECT * FROM matrix_cells WHERE matrix_id = ?").all(row.id);
        res.json({
            ...serializeMatrix(row),
            cells: (cells as Record<string, unknown>[]).map((cell) => ({
                ...cell,
                content: parseJson(String(cell.content_json || "{}"), {}),
            })),
        });
    } catch (err) {
        res.status((err as { statusCode?: number }).statusCode || 500).json({ detail: (err as Error).message });
    }
});

matrixRouter.post("/:id/generate", requireAuth, async (req, res) => {
    setupSse(res);
    try {
        const row = getMatrix(req.params.id);
        if (!row) throw Object.assign(new Error("Matrix not found"), { statusCode: 404 });
        await ensureDealAccess(row.deal_id, (req as AuthedRequest).userId);
        const columns = parseJson<MatrixColumn[]>(row.columns_json, []);
        const docIds = new Set(parseJson<string[]>(row.document_ids_json, []));
        const docs = (await pythonClient.listDocuments(row.deal_id)).filter((doc) => !docIds.size || docIds.has(doc.doc_id));

        for (const doc of docs) {
            const evidence = await selectEvidence(row.deal_id, doc, columns);
            console.log(`[matrix] ${row.id} ${doc.doc_id} retrieval_mode=${evidence.mode}`);
            await queryGeminiAllColumns(
                DEFAULT_TABULAR_MODEL,
                doc.filename,
                evidence.markdown,
                columns,
                async (columnIndex, result) => {
                    upsertCell(row.id, doc.doc_id, columnIndex, "complete", result, evidence.mode);
                    sendCellUpdate(res, doc.doc_id, columnIndex, result, "complete", evidence.mode);
                },
                apiKeys(),
            ).catch(async (err) => {
                console.warn("[matrix] primary model failed, trying fallback", err);
                await queryGeminiAllColumns(
                    FALLBACK_MODEL,
                    doc.filename,
                    evidence.markdown,
                    columns,
                    async (columnIndex, result) => {
                        upsertCell(row.id, doc.doc_id, columnIndex, "complete", result, evidence.mode);
                        sendCellUpdate(res, doc.doc_id, columnIndex, result, "complete", evidence.mode);
                    },
                    apiKeys(),
                );
            });
        }
        res.write(DONE);
        res.end();
    } catch (err) {
        res.write(sse("error", { message: (err as Error).message }));
        res.write(DONE);
        res.end();
    }
});

matrixRouter.post("/:id/regenerate-cell", requireAuth, async (req, res) => {
    setupSse(res);
    try {
        const row = getMatrix(req.params.id);
        if (!row) throw Object.assign(new Error("Matrix not found"), { statusCode: 404 });
        await ensureDealAccess(row.deal_id, (req as AuthedRequest).userId);
        const docId = String(req.body?.document_id || req.body?.doc_id || "");
        const columnIndex = Number(req.body?.column_index);
        const columns = parseJson<MatrixColumn[]>(row.columns_json, []);
        const column = columns.find((col) => col.index === columnIndex);
        if (!docId || !column) throw new Error("document_id and valid column_index are required");
        const doc = (await pythonClient.listDocuments(row.deal_id)).find((item) => item.doc_id === docId);
        if (!doc) throw new Error("Document not found in deal");

        const evidence = await selectEvidence(row.deal_id, doc, [column]);
        const result = await querySingleCell(DEFAULT_TABULAR_MODEL, doc.filename, evidence.markdown, column, apiKeys());
        if (!result) throw new Error("No cell result returned");
        upsertCell(row.id, doc.doc_id, column.index, "complete", result, evidence.mode);
        sendCellUpdate(res, doc.doc_id, column.index, result, "complete", evidence.mode);
        res.write(DONE);
        res.end();
    } catch (err) {
        res.write(sse("error", { message: (err as Error).message }));
        res.write(DONE);
        res.end();
    }
});
