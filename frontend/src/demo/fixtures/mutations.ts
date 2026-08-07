import type { Citation, ConversationEntry } from "@/lib/api";
import { registerDemoRoutes } from "@/demo/transport";

/**
 * Writes in the demo land in memory and vanish on reload. This exists so no
 * interaction errors out mid-demo — not to make the demo feel persistent.
 *
 * Destructive controls (delete deal, delete document) are hidden rather than
 * faked; see the demo branches in the components themselves.
 *
 * Deliberately free of any dependency on `fixtures/chat.ts`. The chat prose is
 * behind a dynamic `import()` (see `lib/sse.ts`) so it stays out of the main
 * bundle; conversation *history* is a plain REST surface that every deal page
 * fetches on mount, so it has to be registered eagerly. Keeping the two apart
 * is what preserves the code split.
 *
 * Findings and brief overrides are stored exactly as the client sent them and
 * handed back inside the envelopes the client unwraps — `{ findings }` and
 * `{ overrides }` (`lib/api.ts:601-630`, `backend/app/models/brief.py`). A bare
 * array or bare object here would resolve `undefined` in `getDealFindings`.
 */
const findingsByDeal = new Map<string, unknown>();
const overridesByDeal = new Map<string, unknown>();
const conversationsByDeal = new Map<string, ConversationEntry[]>();

let conversationSeq = 0;

export function resetDemoMutations(): void {
  findingsByDeal.clear();
  overridesByDeal.clear();
  conversationsByDeal.clear();
  conversationSeq = 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Rebuilds citations field by field rather than passing the request body
 * through. The body is `unknown` at this boundary, and a citation the document
 * viewer cannot resolve is worse than no citation: `source_file` and `page` are
 * what `buildDocumentViewUrl` needs to open the real PDF at the real page.
 */
function toCitations(value: unknown): (Citation | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isRecord(entry)) return null;
    if (typeof entry.source_file !== "string" || typeof entry.page !== "number") return null;
    const citation: Citation = {
      source_file: entry.source_file,
      page: entry.page,
      text_snippet: str(entry.text_snippet),
    };
    if (typeof entry.deal_id === "string") citation.deal_id = entry.deal_id;
    if (entry.kind === "extracted" || entry.kind === "derived") citation.kind = entry.kind;
    if (typeof entry.span_label === "string" || entry.span_label === null) {
      citation.span_label = entry.span_label;
    }
    return citation;
  });
}

function saveConversationEntry(dealId: string, body: unknown): ConversationEntry {
  const payload = isRecord(body) ? body : {};
  conversationSeq += 1;
  const entry: ConversationEntry = {
    id: `demo-conversation-${conversationSeq}`,
    deal_id: dealId,
    question: str(payload.question),
    answer: str(payload.answer),
    citations: toCitations(payload.citations),
    workstream: str(payload.workstream) || "assistant",
    created_at: new Date().toISOString(),
  };
  const existing = conversationsByDeal.get(dealId) ?? [];
  conversationsByDeal.set(dealId, existing.concat(entry));
  return entry;
}

/**
 * `demoFetch` matches on the path with the query string already stripped
 * (`transport.ts:43`), so `?workstream=assistant` reaches the handler only as
 * part of the raw URL. The workstream filter is applied from that raw URL here,
 * mirroring the real endpoint, so the assistant history does not pick up
 * entries saved by another surface.
 */
function conversationsFor(dealId: string, url: string): ConversationEntry[] {
  const entries = conversationsByDeal.get(dealId) ?? [];
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const workstream = new URLSearchParams(query).get("workstream");
  return workstream ? entries.filter((e) => e.workstream === workstream) : entries;
}

export function registerMutationFixtures(): void {
  registerDemoRoutes([
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/findings$/,
      handler: (m) => ({ findings: findingsByDeal.get(m[1]) ?? [] }),
    },
    {
      method: "PUT",
      pattern: /^\/api\/deals\/([^/]+)\/findings$/,
      handler: (m, body) => {
        const findings = isRecord(body) ? body.findings : undefined;
        findingsByDeal.set(m[1], findings ?? []);
        return { findings: findings ?? [] };
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/brief-overrides$/,
      handler: (m) => ({ overrides: overridesByDeal.get(m[1]) ?? {} }),
    },
    {
      method: "PUT",
      pattern: /^\/api\/deals\/([^/]+)\/brief-overrides$/,
      handler: (m, body) => {
        const overrides = isRecord(body) ? body.overrides : undefined;
        overridesByDeal.set(m[1], overrides ?? {});
        return { overrides: overrides ?? {} };
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/conversations$/,
      handler: (m, _body, url) => conversationsFor(m[1], url),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/([^/]+)\/conversations$/,
      handler: (m, body) => saveConversationEntry(m[1], body),
    },
  ]);
}
