/**
 * The demo's in-memory write store.
 *
 * These tests deliberately go through the real `lib/api.ts` callers as well as
 * through `demoFetch` directly. `getDealFindings` reads `res.findings` and
 * `getBriefOverrides` reads `res.overrides` — a fixture that answered with a
 * bare array or a bare object would pass a `demoFetch`-only test and still
 * resolve `undefined` in the app.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "@/demo/transport";
import {
  getBriefOverrides,
  getDealFindings,
  listConversations,
  putBriefOverrides,
  putDealFindings,
  saveConversation,
} from "@/lib/api";
import { DEMO_FLAG_KEY } from "@/demo/mode";
import { DEMO_FUND_III_ID, DEMO_FUND_IV_ID } from "./entities";
import { registerMutationFixtures, resetDemoMutations } from "./mutations";

beforeEach(() => {
  resetDemoRoutes();
  resetDemoMutations();
  registerMutationFixtures();
  sessionStorage.setItem(DEMO_FLAG_KEY, "1");
});

afterEach(() => {
  sessionStorage.clear();
  resetDemoMutations();
});

describe("demo findings", () => {
  it("accepts a findings write and reads it back through the real client", async () => {
    const findings = [{ id: "f1", title: "Undisclosed departure" }];
    await putDealFindings(DEMO_FUND_IV_ID, findings);
    expect(await getDealFindings(DEMO_FUND_IV_ID)).toEqual(findings);
  });

  it("answers with the findings envelope the client unwraps, not a bare array", async () => {
    const res = await demoFetch(`/api/deals/${DEMO_FUND_IV_ID}/findings`, { method: "GET" })!;
    expect(await res.json()).toEqual({ findings: [] });
  });

  it("returns an empty list for a deal with no writes", async () => {
    expect(await getDealFindings(DEMO_FUND_III_ID)).toEqual([]);
  });

  it("keeps each deal's findings separate", async () => {
    await putDealFindings(DEMO_FUND_IV_ID, [{ id: "iv" }]);
    expect(await getDealFindings(DEMO_FUND_III_ID)).toEqual([]);
  });

  it("forgets everything on reset, because demo writes never persist", async () => {
    await putDealFindings(DEMO_FUND_IV_ID, [{ id: "f1" }]);
    resetDemoMutations();
    expect(await getDealFindings(DEMO_FUND_IV_ID)).toEqual([]);
  });
});

describe("demo brief overrides", () => {
  it("accepts overrides and reads them back through the real client", async () => {
    const overrides = { about: { strategy: "Buyout (edited)" } };
    await putBriefOverrides(DEMO_FUND_IV_ID, overrides);
    expect(await getBriefOverrides(DEMO_FUND_IV_ID)).toEqual(overrides);
  });

  it("answers with the overrides envelope the client unwraps", async () => {
    const res = await demoFetch(`/api/deals/${DEMO_FUND_IV_ID}/brief-overrides`, {
      method: "GET",
    })!;
    expect(await res.json()).toEqual({ overrides: {} });
  });

  it("returns an empty map for a deal with no writes", async () => {
    expect(await getBriefOverrides(DEMO_FUND_III_ID)).toEqual({});
  });
});

describe("demo conversations", () => {
  it("matches the history request even though it carries a query string", async () => {
    // The banner this fixture removes was caused by
    // `GET /api/deals/:id/conversations?workstream=assistant` falling through.
    const res = demoFetch(`/api/deals/${DEMO_FUND_IV_ID}/conversations?workstream=assistant`, {
      method: "GET",
    });
    expect(res).not.toBeNull();
    expect(await (await res!).json()).toEqual([]);
  });

  it("starts a fund with no history rather than inventing chats", async () => {
    expect(await listConversations(DEMO_FUND_IV_ID, "assistant")).toEqual([]);
  });

  it("keeps an answer in history for the rest of the session", async () => {
    const saved = await saveConversation(DEMO_FUND_IV_ID, {
      question: "Has any senior investment professional left the firm?",
      answer: "A material inconsistency exists…",
      citations: [{ source_file: "brightwater_adv_part2a.pdf", page: 2, text_snippet: "…" }],
      workstream: "assistant",
    });

    expect(saved.deal_id).toBe(DEMO_FUND_IV_ID);
    expect(saved.workstream).toBe("assistant");
    expect(saved.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(saved.created_at))).toBe(false);
    expect(saved.citations).toEqual([
      { source_file: "brightwater_adv_part2a.pdf", page: 2, text_snippet: "…" },
    ]);

    const history = await listConversations(DEMO_FUND_IV_ID, "assistant");
    expect(history).toEqual([saved]);
  });

  it("filters history by workstream, as the real endpoint does", async () => {
    await saveConversation(DEMO_FUND_IV_ID, {
      question: "q",
      answer: "a",
      workstream: "assistant",
    });
    await saveConversation(DEMO_FUND_IV_ID, {
      question: "q2",
      answer: "a2",
      workstream: "doc-matrix",
    });

    expect(await listConversations(DEMO_FUND_IV_ID, "assistant")).toHaveLength(1);
    expect(await listConversations(DEMO_FUND_IV_ID)).toHaveLength(2);
  });

  it("gives each saved answer a distinct id", async () => {
    const a = await saveConversation(DEMO_FUND_IV_ID, { question: "q", answer: "a" });
    const b = await saveConversation(DEMO_FUND_IV_ID, { question: "q", answer: "a" });
    expect(a.id).not.toBe(b.id);
  });

  it("does not leak one fund's history into its sibling", async () => {
    await saveConversation(DEMO_FUND_IV_ID, { question: "q", answer: "a" });
    expect(await listConversations(DEMO_FUND_III_ID)).toEqual([]);
  });

  it("drops a malformed citation rather than passing a broken one to the viewer", async () => {
    const saved = await saveConversation(DEMO_FUND_IV_ID, {
      question: "q",
      answer: "a",
      citations: [null, { source_file: "brightwater_iv_ddq.pdf", page: 4, text_snippet: "x" }],
    });
    expect(saved.citations).toEqual([
      null,
      { source_file: "brightwater_iv_ddq.pdf", page: 4, text_snippet: "x" },
    ]);
  });
});
