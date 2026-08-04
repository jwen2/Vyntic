import { describe, it, expect, beforeEach } from "vitest";
import { resetDemoRoutes } from "@/demo/transport";
import { demoFetch } from "@/demo/transport";
import {
  registerEntityFixtures,
  DEMO_DEALS,
  DEMO_FUND_IV_ID,
  DEMO_MANAGER_ID,
} from "./entities";
import type { Deal } from "@/lib/api";

describe("entity fixtures", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerEntityFixtures();
  });

  it("lists both Brightwater funds", async () => {
    const res = await demoFetch("/api/deals", { method: "GET" })!;
    const deals = (await res.json()) as Deal[];
    expect(deals).toHaveLength(2);
    expect(deals.map((d) => d.deal_id).sort()).toEqual([
      "brightwater_iii",
      "brightwater_iv",
    ]);
  });

  it("serves every fund as entity_type fund under one manager", () => {
    for (const deal of DEMO_DEALS) {
      expect(deal.entity_type).toBe("fund");
      expect(deal.manager_id).toBe(DEMO_MANAGER_ID);
    }
  });

  it("resolves a single deal by id", async () => {
    const res = await demoFetch(`/api/deals/${DEMO_FUND_IV_ID}`, { method: "GET" })!;
    const deal = (await res.json()) as Deal;
    expect(deal.deal_id).toBe(DEMO_FUND_IV_ID);
    expect(deal.vintage).toBe(2026);
  });

  it("serves documents for each fund with unique filenames across the corpus", async () => {
    const seen = new Set<string>();
    for (const deal of DEMO_DEALS) {
      const res = await demoFetch(`/api/deals/${deal.deal_id}/documents`, {
        method: "GET",
      })!;
      const docs = (await res.json()) as { filename: string }[];
      expect(docs.length).toBeGreaterThan(0);
      for (const doc of docs) {
        // The static asset dir is flat and keyed by filename alone, so a
        // collision here would silently serve the wrong PDF.
        expect(seen.has(doc.filename)).toBe(false);
        seen.add(doc.filename);
      }
    }
  });

  it("serves the manager and its two funds", async () => {
    const mgr = await (await demoFetch(`/api/managers/${DEMO_MANAGER_ID}`, {
      method: "GET",
    })!).json();
    expect(mgr.manager_id).toBe(DEMO_MANAGER_ID);

    const funds = await (await demoFetch(`/api/managers/${DEMO_MANAGER_ID}/funds`, {
      method: "GET",
    })!).json();
    expect(funds).toHaveLength(2);
  });
});
