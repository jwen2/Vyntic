import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "@/demo/transport";
import { ApiError } from "@/lib/api";
import {
  cloneWorkflow,
  downloadRunExport,
  retryCell,
  startWorkflowRun,
} from "@/lib/workflows";
import { disableDemoMode, enableDemoMode } from "@/demo/mode";
import {
  registerWorkflowFixtures,
  DEMO_DDQ_RUN,
  DEMO_DDQ_WORKFLOW,
  DEMO_DDQ_ROWS,
  armDemoRunReplay,
  endDemoRunReplay,
} from "./workflows";
import {
  DEMO_CATALOGUE,
  DEMO_RECORDINGS,
  RECORDING_BY_WORKFLOW,
} from "./workflowRegistry";
import { DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import type { Workflow, WorkflowRun } from "@/lib/workflows";

/**
 * The built-in's real column ids paired with their real labels, transcribed
 * from the seeded database dump in
 * `.superpowers/sdd/2026-08-03-demo-mode-odd/corpus-ground-truth.md`
 * ("DDQ Gap & Consistency Scan — real IDs").
 *
 * This golden exists because nothing else pins the pairing. The ordering test
 * compares cell `column_id`s against workflow `column.id`s and is label-blind:
 * swap two labels while leaving the ids in place and every other test still
 * passes, while the demo silently files each recorded answer under the wrong
 * DDQ section.
 *
 * Per CLAUDE.md invariant 4, built-in column ids are stable across startup
 * reconciliation, so this table is a fact about the backend rather than a
 * snapshot of the fixture. A failure therefore means one of exactly two
 * things: `workflow_seed_lp.py` really renamed or reordered a column, in which
 * case update this table deliberately from a fresh read of the seeded DB; or
 * someone edited `workflows.ts` carelessly, in which case revert the edit.
 */
const DDQ_COLUMN_GOLDEN: ReadonlyArray<{
  order_index: number;
  id: string;
  label: string;
}> = [
  { order_index: 1, id: "4223f1f6938a46b9aa0be66a6044bf05", label: "Firm & Ownership" },
  { order_index: 2, id: "68558a7e665548a28536c1b7f2a13314", label: "Team & Succession" },
  { order_index: 3, id: "ef3ececba4894d829463c407cb2cd156", label: "Track Record" },
  {
    order_index: 4,
    id: "dd0188ff630d467d9941ccf80d34a740",
    label: "Investment Strategy & Process",
  },
  { order_index: 5, id: "a01ad37a06444c348b93de7cecd96e5f", label: "Fund Terms & Economics" },
  { order_index: 6, id: "9814f84441844e788e44523b2002848c", label: "Valuation Policy" },
  { order_index: 7, id: "9f181791b2a247a59135123e8b7de3d0", label: "Compliance & Regulatory" },
  { order_index: 8, id: "b778bec0d4c84fb6b3ecc85a1c24f3fb", label: "IT & Cybersecurity" },
  { order_index: 9, id: "f9b31fbd5a8842e0b1f339e5a456c7bd", label: "ESG" },
  { order_index: 10, id: "8495ea4a16a74d1ca73fe891d5a8f9e5", label: "LP Base & References" },
  { order_index: 11, id: "1b2486ce7b1b4480b5c2af0913241e38", label: "Conflicts of Interest" },
  { order_index: 12, id: "634bbe4f41a84ce0b63d01a9b26bdbda", label: "Service Providers" },
];

describe("workflow fixtures", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerWorkflowFixtures();
  });

  afterEach(() => {
    endDemoRunReplay();
  });

  it("exposes the DDQ Gap & Consistency Scan with 12 markdown columns", () => {
    expect(DEMO_DDQ_WORKFLOW.id).toBe("builtin_lp_ddq_scan");
    expect(DEMO_DDQ_WORKFLOW.name).toBe("DDQ Gap & Consistency Scan");
    expect(DEMO_DDQ_WORKFLOW.entity_type).toBe("fund");
    expect(DEMO_DDQ_WORKFLOW.row_source).toBe("multi_doc_synthesis");
    expect(DEMO_DDQ_WORKFLOW.is_builtin).toBe(true);
    expect(DEMO_DDQ_WORKFLOW.columns).toHaveLength(12);
    // This workflow has no enum column, so the demo stages no
    // Clean/Monitor/Red flag badge — the risk language lives in the prose.
    for (const column of DEMO_DDQ_WORKFLOW.columns) {
      expect(column.format, column.label).toBe("markdown");
      expect(column.tags, column.label).toBeNull();
    }
  });

  it("pairs every column id with the label the database gave it", () => {
    expect(
      DEMO_DDQ_WORKFLOW.columns.map((c) => ({
        order_index: c.order_index,
        id: c.id,
        label: c.label,
      }))
    ).toEqual(DDQ_COLUMN_GOLDEN);
  });

  it("builds each column prompt around the upper-cased section name", () => {
    const firm = DEMO_DDQ_WORKFLOW.columns[0];
    expect(firm.label).toBe("Firm & Ownership");
    // Was pinning a transcribed `columnPrompt()` helper; now it pins the real
    // seeded prompt (workflow_seed_lp.py:26), which upper-cases the whole
    // section name. An `&` label proves it is the whole name, not just the
    // first word.
    expect(firm.prompt).toContain("FIRM & OWNERSHIP");
    expect(firm.prompt).not.toContain("Firm & Ownership");
    for (const column of DEMO_DDQ_WORKFLOW.columns) {
      expect(column.prompt, column.label).toContain(column.label.toUpperCase());
    }
  });

  it("records exactly 1 row x 12 columns = 12 cells", () => {
    expect(DEMO_DDQ_ROWS).toEqual(["DDQ Gap & Consistency Scan"]);
    expect(DEMO_DDQ_RUN.cells).toHaveLength(12);
    for (const cell of DEMO_DDQ_RUN.cells) {
      expect(cell.row_key).toBe(DEMO_DDQ_ROWS[0]);
    }
  });

  it("serves the workflow list, the workflow, and the run over the fixture transport", async () => {
    const list = await (await demoFetch(`/api/deals/${DEMO_FUND_IV_ID}/workflows`, {
      method: "GET",
    })!).json();
    expect(list.some((w: { name: string }) => w.name === "DDQ Gap & Consistency Scan")).toBe(
      true
    );

    const workflow = await (await demoFetch(
      `/api/deals/${DEMO_FUND_IV_ID}/workflows/${DEMO_DDQ_WORKFLOW.id}`,
      { method: "GET" }
    )!).json();
    expect(workflow.columns).toHaveLength(12);

    const run = await (await demoFetch(`/api/runs/${DEMO_DDQ_RUN.id}`, {
      method: "GET",
    })!).json();
    expect(run.cells).toHaveLength(12);
  });

  it("shows the recorded run as history on Fund IV only", async () => {
    const ivRuns = await (await demoFetch(
      `/api/deals/${DEMO_FUND_IV_ID}/workflows/${DEMO_DDQ_WORKFLOW.id}/runs`,
      { method: "GET" }
    )!).json();
    expect(ivRuns).toHaveLength(1);
    expect(ivRuns[0].id).toBe(DEMO_DDQ_RUN.id);

    const iiiRuns = await (await demoFetch(
      `/api/deals/${DEMO_FUND_III_ID}/workflows/${DEMO_DDQ_WORKFLOW.id}/runs`,
      { method: "GET" }
    )!).json();
    expect(iiiRuns).toEqual([]);
  });

  it("lists all eight built-ins on both funds, because a real fund workspace does", async () => {
    for (const dealId of [DEMO_FUND_IV_ID, DEMO_FUND_III_ID]) {
      const list = await (await demoFetch(`/api/deals/${dealId}/workflows`, {
        method: "GET",
      })!).json();
      expect(list, dealId).toHaveLength(8);
      expect(list.map((w: Workflow) => w.name).sort(), dealId).toEqual(
        [
          "DDQ Gap & Consistency Scan",
          "Fund Brief",
          "Fund Commitment Memo",
          "Fund Terms Extractor",
          "LPA / ILPA-Alignment Review",
          "ODD Screen",
          "Side Letter Obligation Extractor",
          "Track Record Grid",
        ].sort()
      );
    }
  });

  it("serves any catalogue workflow by id, on either fund", async () => {
    for (const template of DEMO_CATALOGUE) {
      const got = await (await demoFetch(
        `/api/deals/${DEMO_FUND_III_ID}/workflows/${template.id}`,
        { method: "GET" }
      )!).json();
      expect(got.id, template.name).toBe(template.id);
      expect(got.columns.length, template.name).toBe(template.columns.length);
    }
  });

  it("shows a recorded run only in the workspace it was recorded in", async () => {
    for (const rec of DEMO_RECORDINGS) {
      const other = rec.dealId === DEMO_FUND_IV_ID ? DEMO_FUND_III_ID : DEMO_FUND_IV_ID;

      const here = await (await demoFetch(
        `/api/deals/${rec.dealId}/workflows/${rec.workflowId}/runs`,
        { method: "GET" }
      )!).json();
      expect(here.map((r: WorkflowRun) => r.id), rec.workflowId).toEqual([rec.run.id]);

      const there = await (await demoFetch(
        `/api/deals/${other}/workflows/${rec.workflowId}/runs`,
        { method: "GET" }
      )!).json();
      expect(there, rec.workflowId).toEqual([]);
    }
  });

  it("shows no run history for a built-in that has no recording", async () => {
    const unrecorded = DEMO_CATALOGUE.filter((w) => !RECORDING_BY_WORKFLOW.has(w.id));
    expect(unrecorded.length).toBeGreaterThan(0);
    for (const template of unrecorded) {
      const runs = await (await demoFetch(
        `/api/deals/${DEMO_FUND_IV_ID}/workflows/${template.id}/runs`,
        { method: "GET" }
      )!).json();
      expect(runs, template.name).toEqual([]);
    }
  });

  it("starts the run belonging to the workflow the visitor pressed Run on", async () => {
    for (const rec of DEMO_RECORDINGS) {
      const started = await (await demoFetch(
        `/api/deals/${rec.dealId}/workflows/${rec.workflowId}/runs`,
        { method: "POST", body: JSON.stringify({ document_ids: [], synthesis_questions: [] }) }
      )!).json();
      expect(started.id, rec.workflowId).toBe(rec.run.id);
      expect(started.status, rec.workflowId).toBe("running");
      // Disarm inside the loop, not just in `afterEach`: `armDemoRunReplay`
      // overwrites unconditionally, so without this every iteration after the
      // first starts with the previous run still armed and the test stops
      // proving that a run-start arms *its own* recording.
      endDemoRunReplay();
    }
  });

  it("lists every recording on the deal-level run feed of its own fund", async () => {
    for (const dealId of [DEMO_FUND_IV_ID, DEMO_FUND_III_ID]) {
      const runs = await (await demoFetch(`/api/deals/${dealId}/runs`, {
        method: "GET",
      })!).json();
      const expected = DEMO_RECORDINGS.filter((r) => r.dealId === dealId).map(
        (r) => r.run.id
      );
      expect(runs.map((r: WorkflowRun) => r.id).sort(), dealId).toEqual(expected.sort());
    }
  });
});

/**
 * `isReplayInFlight`'s `armedRunId === runId` guard is exercised directly
 * inside the replay engine (`runReplay.test.ts`'s "does not animate a run
 * that was not the one armed"), but nothing hit it through the route the
 * app actually calls. A guard that regressed to "any arm makes any run look
 * queued" would still pass every existing test and would only show up as a
 * completed DDQ run looking stuck mid-animation while some other workflow
 * was starting.
 */
describe("run identity at the route level", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerWorkflowFixtures();
  });

  afterEach(() => {
    endDemoRunReplay();
  });

  it("still reports a recorded run as complete while a different run id is armed", async () => {
    const [rec] = DEMO_RECORDINGS;
    armDemoRunReplay("some-run-id-nobody-recorded");

    const fetched = await (await demoFetch(`/api/runs/${rec.run.id}`, {
      method: "GET",
    })!).json();

    expect(fetched.status).toBe("complete");
  });

  /**
   * The same guard with two *real* recordings, which is the shape a visitor
   * produces: press Run on one workflow, then open another workflow's finished
   * run from its history while the first is still animating. The started run
   * must read as in progress and the other as the completed recording it is —
   * a regression here shows up as a finished grid stuck at 0 cells.
   */
  it("keeps a started run and a browsed run apart while both are in play", async () => {
    const [started, browsed] = DEMO_RECORDINGS;
    expect(browsed, "needs two recordings to be meaningful").toBeDefined();
    expect(browsed.run.id).not.toBe(started.run.id);

    await demoFetch(`/api/deals/${started.dealId}/workflows/${started.workflowId}/runs`, {
      method: "POST",
      body: JSON.stringify({ document_ids: [], synthesis_questions: [] }),
    });

    const inFlight = await (await demoFetch(`/api/runs/${started.run.id}`, {
      method: "GET",
    })!).json();
    const other = await (await demoFetch(`/api/runs/${browsed.run.id}`, {
      method: "GET",
    })!).json();

    expect(inFlight.status, started.workflowId).toBe("running");
    expect(other.status, browsed.workflowId).toBe("complete");
    expect(
      other.cells.every((c: { status: string }) => c.status === "complete"),
      "the browsed run came back queued — the arm leaked across recordings"
    ).toBe(true);
  });
});

/**
 * Driven through `lib/workflows.ts` rather than `demoFetch`, so the assertion
 * is what a visitor's click produces: `requestRaw` turns the 403 into an
 * `ApiError` carrying the detail, which is the string every panel renders.
 */
describe("writes around the recorded run", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerWorkflowFixtures();
    enableDemoMode();
  });

  afterEach(() => {
    // `replayPhase`/`armedRunId` are module state in workflows.ts, untouched by
    // `resetDemoRoutes()`. Without this, a test that starts a run (arming its
    // replay) leaks that arm into whichever test runs next.
    endDemoRunReplay();
    disableDemoMode();
    resetDemoRoutes();
  });

  const GENERIC = "Not available in demo";

  it("refuses a cell rerun, saying the answers are fixed and still cited", async () => {
    const err = await retryCell(DEMO_DDQ_RUN.id, "cell_a").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).not.toBe(GENERIC);
    expect(err.message).toContain("cited");
  });

  it("refuses the Excel export, saying there is no backend to build it", async () => {
    const err = await downloadRunExport(DEMO_DDQ_RUN.id, "xlsx").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain("server-side");
  });

  it("refuses cloning the built-in workflow", async () => {
    const err = await cloneWorkflow(DEMO_FUND_IV_ID, DEMO_DDQ_WORKFLOW.id).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toBe(GENERIC);
  });

  // Starting a run must NOT be refused — it arms the replay that is the demo's
  // centrepiece. This is the one POST on this surface that still answers.
  it("still starts a run, because that is what replays the recording", async () => {
    const started = await startWorkflowRun(DEMO_FUND_IV_ID, DEMO_DDQ_WORKFLOW.id, []);
    expect(started.id).toBe(DEMO_DDQ_RUN.id);
  });

  it("refuses each unrecorded built-in by describing what it really produces", async () => {
    const cases: [name: string, mustSay: string][] = [
      ["Fund Brief", "Brief"],
      ["Track Record Grid", "TVPI"],
      ["Fund Commitment Memo", "checkpoint"],
    ];
    for (const [name, mustSay] of cases) {
      const template = DEMO_CATALOGUE.find((w) => w.name === name);
      expect(template, name).toBeDefined();
      const err = await startWorkflowRun(DEMO_FUND_IV_ID, template!.id, []).catch((e) => e);

      expect(err, name).toBeInstanceOf(ApiError);
      expect(err.status, name).toBe(403);
      expect(err.message, name).not.toBe(GENERIC);
      expect(err.message, name).toContain(mustSay);
      expect(err.message.length, name).toBeGreaterThan(40);
    }
  });

  it("turns a wrong-fund run into navigation rather than a dead end", async () => {
    for (const rec of DEMO_RECORDINGS) {
      const other = rec.dealId === DEMO_FUND_IV_ID ? DEMO_FUND_III_ID : DEMO_FUND_IV_ID;
      const err = await startWorkflowRun(other, rec.workflowId, []).catch((e) => e);

      expect(err, rec.workflowId).toBeInstanceOf(ApiError);
      expect(err.status, rec.workflowId).toBe(403);
      // It must name the fund the visitor should open, or it is not navigation.
      const target =
        rec.dealId === DEMO_FUND_IV_ID
          ? "Brightwater Capital Partners IV"
          : "Brightwater Capital Partners III";
      expect(err.message, rec.workflowId).toContain(target);
      expect(err.message, rec.workflowId).toContain("open that workspace");
    }
  });

  it("does not arm a replay when it refuses a wrong-fund run", async () => {
    const rec = DEMO_RECORDINGS[0];
    const other = rec.dealId === DEMO_FUND_IV_ID ? DEMO_FUND_III_ID : DEMO_FUND_IV_ID;
    await startWorkflowRun(other, rec.workflowId, []).catch(() => {});

    // A refusal that armed anyway would animate the next run view the visitor
    // opened, which is the whole failure mode the registry exists to stop.
    const fetched = await (await demoFetch(`/api/runs/${rec.run.id}`, {
      method: "GET",
    })!).json();
    expect(fetched.status).toBe("complete");
  });
});
