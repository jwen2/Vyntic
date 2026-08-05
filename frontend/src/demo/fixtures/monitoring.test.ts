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

/**
 * Empty, not absent. These reads used to reject, which rendered a red
 * `ApiError` band on arrival at the Monitoring tab — a state the product does
 * not have. An empty queue is one it does: nothing has been extracted yet.
 */
describe("surfaces awaiting a recorded extraction", () => {
  it("resolves the notice queue and obligation list rather than erroring", async () => {
    await expect(listCallNotices("brightwater_iii")).resolves.toEqual([]);
    await expect(listObligations("brightwater_iii")).resolves.toEqual([]);
    await expect(getPortfolioCallNotices()).resolves.toEqual([]);
    await expect(getPortfolioCompliance()).resolves.toEqual([]);
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
