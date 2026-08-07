import type { Workflow, WorkflowRun } from "@/lib/workflows";
import catalogue from "./recorded-workflows.json";
import ddqScanRun from "./recorded-ddq-scan-run.json";
import fundTermsRun from "./recorded-fund-terms-run.json";
import oddScreenRun from "./recorded-odd-screen-run.json";
import lpaIlpaRun from "./recorded-lpa-ilpa-run.json";
import sideLettersRun from "./recorded-side-letters-run.json";

/**
 * The eight LP built-ins, frozen from a real
 * `GET /deals/brightwater_iv/workflows` (scripts/record_demo_run.mjs
 * --catalogue). Hand-mirroring them would mean ~90 copied column ids and eight
 * prompt builders drifting silently from workflow_seed_lp.py; recording is the
 * same principle the run fixtures rest on. Both demo funds are
 * entity_type="fund", so workflow_store.py:87-94 serves them the same list and
 * one dump covers both.
 *
 * This and the run imports below are the only places a JSON import crosses into
 * typed code. The casts are claims; the walkers in workflowRegistry.test.ts are
 * the checks.
 */
export const DEMO_CATALOGUE = catalogue as unknown as Workflow[];

export function workflowById(id: string): Workflow | undefined {
  return DEMO_CATALOGUE.find((w) => w.id === id);
}

/** A recorded run, everything the routes and the replay need to serve it. */
export interface DemoRecording {
  workflowId: string;
  /** The workspace it was recorded in. Runs show only on this fund. */
  dealId: string;
  workflow: Workflow;
  run: WorkflowRun;
  /** The same run as the visitor sees it the instant they press Run. */
  queued: WorkflowRun;
  /** Distinct row keys, in first-seen order. */
  rows: string[];
}

/**
 * The run as it is the moment it starts: the grid already has its full shape,
 * but no cell has an answer yet. The run-start route hands this back and the
 * replay opens its stream with it, so the shape never changes mid-animation —
 * only its contents. Derived rather than recorded, so it cannot drift.
 */
function toQueued(run: WorkflowRun): WorkflowRun {
  return {
    ...run,
    status: "running",
    completed_at: null,
    cells: run.cells.map((cell) => ({
      ...cell,
      status: "queued",
      answer: "",
      answer_display: "",
      answer_formatted: null,
      citations: [],
      quality: null,
      duration_ms: 0,
      started_at: null,
      completed_at: null,
    })),
  };
}

function recording(raw: unknown): DemoRecording {
  const run = raw as unknown as WorkflowRun;
  const workflow = workflowById(run.workflow_id);
  if (!workflow) {
    throw new Error(
      `Demo registry: recorded run ${run.id} names workflow ${run.workflow_id}, ` +
        `which is not in recorded-workflows.json. Re-record the catalogue.`
    );
  }
  return {
    workflowId: run.workflow_id,
    dealId: run.deal_id,
    workflow,
    run,
    queued: toQueued(run),
    rows: [...new Set(run.cells.map((c) => c.row_key))],
  };
}

/**
 * Every run the demo can play. Recorded against the real Brightwater corpus
 * with a real model (scripts/record_demo_run.mjs) and frozen verbatim, so the
 * demo needs no LLM, no key and no backend at runtime — but reads as genuine,
 * because it is. Never hand-edit the JSON.
 */
export const DEMO_RECORDINGS: DemoRecording[] = [
  recording(ddqScanRun),
  recording(fundTermsRun),
  recording(oddScreenRun),
  recording(lpaIlpaRun),
  recording(sideLettersRun),
];

export const RECORDING_BY_WORKFLOW = new Map(
  DEMO_RECORDINGS.map((r) => [r.workflowId, r])
);
export const RECORDING_BY_RUN = new Map(DEMO_RECORDINGS.map((r) => [r.run.id, r]));
