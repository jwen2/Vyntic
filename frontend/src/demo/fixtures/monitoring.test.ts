import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ApiError,
  extractCallNotice,
  getPosition,
  listCallNotices,
  listObligations,
  getPortfolioCompliance,
  getPortfolioCallNotices,
  getPortfolioPositions,
  upsertPosition,
  updateDocumentMetadata,
} from "@/lib/api";
import { disableDemoMode, enableDemoMode } from "@/demo/mode";
import { resetDemoRoutes } from "@/demo/transport";
import { registerEntityFixtures } from "./entities";
import { registerMonitoringFixtures } from "./monitoring";

/**
 * Driven through the real exported callers rather than the handlers, for the
 * reason Task 8a learned the hard way: a fixture tested against itself passes
 * while the product reads `undefined`. These go through `request()`, so a wrong
 * shape or a mis-anchored pattern fails here the way it would on screen.
 */
beforeEach(() => {
  resetDemoRoutes();
  registerEntityFixtures();
  registerMonitoringFixtures();
  enableDemoMode();
});

afterEach(() => {
  disableDemoMode();
  resetDemoRoutes();
});

describe("Fund III position", () => {
  /**
   * Every figure is from glenmoor_fund_iii_pcap_q2_2026.pdf p.1. If a fixture
   * edit ever drifts from the document, this is where it is caught — a prospect
   * can open that page from the same workspace and read the numbers.
   */
  it("reports the capital account statement's figures exactly", async () => {
    const position = await getPosition("brightwater_iii");

    expect(position.commitment_amount).toBe(25_000_000);
    expect(position.called_amount).toBe(18_750_000);
    expect(position.distributed_amount).toBe(6_200_000);
    expect(position.nav).toBe(21_400_000);
    expect(position.as_of).toBe("2026-06-30");
    expect(position.currency).toBe("USD");
  });

  it("reports no notices, so called and distributed are the stored figures", async () => {
    expect((await getPosition("brightwater_iii")).has_notices).toBe(false);
  });

  it("leaves Fund IV unpositioned — it is under diligence, not committed to", async () => {
    const position = await getPosition("brightwater_iv");

    expect(position.commitment_amount).toBeNull();
    expect(position.called_amount).toBeNull();
    expect(position.nav).toBeNull();
    expect(position.as_of).toBeNull();
  });
});

describe("portfolio board", () => {
  it("lists every fund and computes unfunded as commitment less called", async () => {
    const rows = await getPortfolioPositions();

    expect(rows.map((r) => r.deal_id).sort()).toEqual(["brightwater_iii", "brightwater_iv"]);
    const iii = rows.find((r) => r.deal_id === "brightwater_iii");
    // 25,000,000 - 18,750,000. Not the 4,375,000 the capital-call notice
    // quotes: that call is dated after this position's June 30 as-of date and
    // has not been extracted.
    expect(iii?.unfunded).toBe(6_250_000);
    expect(iii?.fund_name).toBe("Brightwater Capital Partners III");
    expect(iii?.manager_name).toBe("Brightwater Capital Partners, LLC");
  });

  it("carries no unfunded figure for a fund with no commitment", async () => {
    const rows = await getPortfolioPositions();
    expect(rows.find((r) => r.deal_id === "brightwater_iv")?.unfunded).toBeNull();
  });
});

describe("recorded notices", () => {
  it("carries the capital call and the distribution, with their figures", async () => {
    const notices = await listCallNotices("brightwater_iii");

    expect(notices).toHaveLength(2);
    const call = notices.find((n) => n.kind === "call");
    // brightwater_iii_capital_call_07.pdf: $1,875,000, $4,375,000 unfunded after.
    expect(call?.amount).toBe(1_875_000);
    expect(call?.outstanding_before).toBe(4_375_000);
    expect(notices.find((n) => n.kind === "distribution")?.amount).toBe(1_400_000);
  });

  /**
   * The recording returned "2026-07-27 [Source 1]" — the citation marker leaked
   * into a date field. Prose keeps its markers; a date must parse. Asserted on
   * every notice so a re-recording cannot quietly reintroduce it.
   */
  it("exposes due dates as dates, not as prose carrying citation markers", async () => {
    for (const notice of await listCallNotices("brightwater_iii")) {
      expect(notice.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(notice.due_date!))) .toBe(false);
    }
  });

  it("keeps the evidence: every notice still cites its source document", async () => {
    for (const notice of await listCallNotices("brightwater_iii")) {
      const cites = notice.citations.filter((c) => c !== null);
      expect(cites.length).toBeGreaterThan(0);
      expect(cites[0]!.source_file).toMatch(/^brightwater_iii_/);
    }
  });

  it("leaves Fund IV's queue empty — it holds no commitment to call against", async () => {
    await expect(listCallNotices("brightwater_iv")).resolves.toEqual([]);
    await expect(listObligations("brightwater_iv")).resolves.toEqual([]);
  });
});

describe("recorded side-letter obligations", () => {
  it("carries all seven obligations, each checked against Q2 2026", async () => {
    const obligations = await listObligations("brightwater_iii");

    expect(obligations).toHaveLength(7);
    for (const o of obligations) {
      expect(o.latest_check?.period).toBe("Q2 2026");
      expect(o.text.length).toBeGreaterThan(0);
    }
  });

  it("finds the fee reduction compliant — the one verdict the model would commit to", async () => {
    const obligations = await listObligations("brightwater_iii");
    const fee = obligations.find((o) => o.category === "fee");

    expect(fee?.latest_check?.verdict).toBe("compliant");
    expect(fee?.latest_check?.rationale).toContain("1.90%");
  });

  /**
   * The corpus plants a 45-day reporting breach, and the model declined to call
   * it one: the report is dated August 29, but nothing says when it was
   * delivered, so the clock cannot be verified. This test pins that verdict as
   * RECORDED rather than as desired. If a re-recording produces `breach` on its
   * own merits, update it — but never edit the JSON to get there.
   */
  it("reports the quarterly-reporting obligation as the model judged it, not as the corpus intended", async () => {
    const obligations = await listObligations("brightwater_iii");
    const reporting = obligations.find((o) => o.text.includes("45 days"));

    expect(reporting?.latest_check?.verdict).toBe("unclear");
    expect(reporting?.latest_check?.rationale).toContain("August 29, 2026");
  });

  it("never ships a verdict with no rationale behind it", async () => {
    for (const o of await listObligations("brightwater_iii")) {
      expect(o.latest_check?.rationale.length).toBeGreaterThan(20);
    }
  });
});

describe("portfolio boards built from the recording", () => {
  it("lists both notices against their fund and manager", async () => {
    const notices = await getPortfolioCallNotices();

    expect(notices).toHaveLength(2);
    expect(notices.every((n) => n.fund_name === "Brightwater Capital Partners III")).toBe(true);
    expect(notices.every((n) => n.manager_name === "Brightwater Capital Partners, LLC")).toBe(true);
  });

  it("flags the six obligations whose verdict is not compliant", async () => {
    const flagged = await getPortfolioCompliance();

    expect(flagged).toHaveLength(6);
    expect(flagged.some((o) => o.latest_check?.verdict === "compliant")).toBe(false);
  });

  /**
   * The recording came out of a dev database holding funds that are not part of
   * the demo (hillpath_fund_iv among them). The boards are annotated from the
   * demo's own deal list precisely so none of them can appear here.
   */
  it("cannot surface a fund from outside the demo", async () => {
    const dealIds = [
      ...(await getPortfolioCallNotices()).map((n) => n.deal_id),
      ...(await getPortfolioCompliance()).map((o) => o.deal_id),
      ...(await getPortfolioPositions()).map((p) => p.deal_id),
    ];
    expect([...new Set(dealIds)].sort()).toEqual(["brightwater_iii", "brightwater_iv"]);
  });
});

describe("writes are refused in the product's own words", () => {
  /** The generic unmatched-path message. Seeing it means a refusal is missing,
   *  not that one fired. */
  const GENERIC = "Not available in demo";

  it("explains why extraction is not wired, and points at the recorded work", async () => {
    const err = await extractCallNotice("brightwater_iii", "doc_a").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toBe(GENERIC);
    expect(err.message).toContain("recorded");
    expect(err.message).toContain("Workflows");
  });

  it("refuses a position save without blaming the network", async () => {
    const err = await upsertPosition("brightwater_iii", { nav: 1 }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain("read-only");
    expect(err.message).not.toMatch(/failed|error/i);
  });

  it("refuses a document metadata change", async () => {
    const err = await updateDocumentMetadata("brightwater_iii", "doc_a", {
      doc_category: "lpa",
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toBe(GENERIC);
  });

  it("answers a refusal with 403, distinguishing it from an unfixtured path", async () => {
    const err = await upsertPosition("brightwater_iii", { nav: 1 }).catch((e) => e);
    expect(err.status).toBe(403);
  });
});
