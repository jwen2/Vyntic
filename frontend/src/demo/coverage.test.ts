import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoFetch, resetDemoRoutes } from "./transport";
import { registerAllDemoFixtures, __resetRegistration } from "./index";
import { DEMO_FUND_III_ID, DEMO_FUND_IV_ID, DEMO_MANAGER_ID } from "./fixtures/entities";
import { DEMO_RECORDINGS } from "./fixtures/workflowRegistry";
import { endDemoRunReplay } from "./fixtures/workflows";

/**
 * The regression guard for the whole demo.
 *
 * An unfixtured path does not throw — `fetchWrapper` answers it with a 404
 * carrying "Not available in demo" (lib/api.ts:76). That is invisible in
 * review and highly visible to a prospect, as a red error band on whatever
 * surface they just opened. This test is what turns that into a failing build.
 *
 * The list is maintained by hand because it is a claim about what the *app*
 * requests, which no amount of introspection over the fixture table can tell
 * us — asking the routes what they serve would only ever confirm they serve
 * what they serve. It came from a real browser walk (see
 * `.superpowers/sdd/2026-08-03-demo-mode-odd/unmocked-paths.md`). Add to it
 * whenever a surface starts calling something new.
 */
const RUN_ID = "0a15ef21994743d88de18935351392eb";
const WORKFLOW_ID = "builtin_lp_ddq_scan";
/** A built-in the demo lists but does not record — its Run must still answer. */
const UNRECORDED_WORKFLOW_ID = "builtin_lp_fund_brief";

/** Answered with data. A miss here blanks or errors a surface. */
const REQUIRED_READS: [string, string][] = [
  ["GET", "/api/auth/me"],
  ["GET", "/api/deals"],
  ["GET", "/api/deals/metadata/stages"],
  ["GET", "/api/deals/metadata/tags"],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/documents`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/documents/brightwater_iv_ddq.pdf/view-token`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/findings`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/brief-overrides`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/conversations`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/conversations?workstream=assistant`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${WORKFLOW_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${WORKFLOW_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${UNRECORDED_WORKFLOW_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${UNRECORDED_WORKFLOW_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/workflows`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/workflows/${WORKFLOW_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/workflows/${WORKFLOW_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/position`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/call-notices`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/side-letters/obligations`],
  // Fund III is a separate workspace, not a variant of Fund IV: context
  // isolation means its surfaces resolve independently.
  ["GET", `/api/deals/${DEMO_FUND_III_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/documents`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/findings`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/conversations`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/position`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/call-notices`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/side-letters/obligations`],
  ["GET", `/api/runs/${RUN_ID}`],
  ["GET", `/api/runs/${RUN_ID}/stream-token`],
  ["GET", "/api/managers"],
  ["GET", `/api/managers/${DEMO_MANAGER_ID}`],
  ["GET", `/api/managers/${DEMO_MANAGER_ID}/funds`],
  ["GET", `/api/managers/${DEMO_MANAGER_ID}/documents`],
  ["GET", "/api/portfolio/positions"],
  ["GET", "/api/portfolio/call-notices"],
  ["GET", "/api/portfolio/compliance"],
];

/**
 * Answered with a refusal that explains itself. These are as load-bearing as
 * the reads: lose the registration and the path falls through to the generic
 * 404, which is exactly the "Not available in demo" band Task 8c removed.
 */
const REQUIRED_REFUSALS: [string, string][] = [
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/call-notices/extract`],
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/call-notices`],
  ["PATCH", `/api/deals/${DEMO_FUND_III_ID}/call-notices/notice_1`],
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/side-letters/extract`],
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/side-letters/obligations`],
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/side-letters/verify`],
  ["PATCH", `/api/deals/${DEMO_FUND_III_ID}/side-letters/checks/check_1`],
  ["PUT", `/api/deals/${DEMO_FUND_III_ID}/position`],
  ["PATCH", `/api/deals/${DEMO_FUND_IV_ID}/documents/doc_1/metadata`],
  ["POST", `/api/deals/${DEMO_FUND_IV_ID}/workflows`],
  ["POST", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${WORKFLOW_ID}/clone`],
  ["GET", `/api/runs/${RUN_ID}/export.xlsx`],
  ["POST", `/api/runs/${RUN_ID}/cells/cell_1/retry`],
  ["POST", `/api/runs/${RUN_ID}/columns/col_1/retry`],
  ["POST", `/api/runs/${RUN_ID}/cancel`],
  // Listed but not recorded: the Run button must say what the workflow does.
  ["POST", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${UNRECORDED_WORKFLOW_ID}/runs`],
  // Recorded, but not in this workspace: the refusal is navigation.
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/workflows/${WORKFLOW_ID}/runs`],
];

const GENERIC = "Not available in demo";

describe("demo fixture coverage", () => {
  beforeEach(() => {
    resetDemoRoutes();
    __resetRegistration();
    registerAllDemoFixtures();
  });

  afterEach(() => {
    endDemoRunReplay();
  });

  it.each(REQUIRED_READS)("serves %s %s", async (method, path) => {
    const res = demoFetch(path, { method });
    expect(res, `missing fixture: ${method} ${path}`).not.toBeNull();
    expect((await res!).status, `${method} ${path} did not answer 200`).toBe(200);
  });

  it.each(REQUIRED_REFUSALS)("refuses %s %s in its own words", async (method, path) => {
    const res = demoFetch(path, { method });
    expect(res, `missing refusal: ${method} ${path}`).not.toBeNull();

    const response = await res!;
    expect(response.status, `${method} ${path} should refuse with 403`).toBe(403);
    const { detail } = await response.json();
    expect(detail, `${method} ${path} fell back to the generic message`).not.toBe(GENERIC);
    expect(detail.length).toBeGreaterThan(40);
  });

  /**
   * Starting a run is the one POST on the run surface that must NOT be
   * refused — it arms the replay that is the demo's centrepiece. Pinned per
   * recording, because a future sweep "completing" the refusal set above would
   * silently kill the best thing in the demo.
   */
  it.each(DEMO_RECORDINGS.map((r) => [r.workflow.name, r.dealId, r.workflowId]))(
    "still starts the %s run rather than refusing it",
    async (_name, dealId, workflowId) => {
      const res = demoFetch(`/api/deals/${dealId}/workflows/${workflowId}/runs`, {
        method: "POST",
      });
      expect(res).not.toBeNull();
      expect((await res!).status).toBe(200);
    }
  );

  it("leaves genuinely unknown paths unmatched, rather than inventing data", () => {
    // The fallback exists so an unfixtured surface fails loudly in dev. A
    // catch-all route would defeat every assertion above.
    expect(demoFetch("/api/deals/brightwater_iv/nonexistent", { method: "GET" })).toBeNull();
  });
});
