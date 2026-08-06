import type { Workflow, WorkflowRun } from "@/lib/workflows";
import { DemoRefusal, registerDemoRoutes } from "@/demo/transport";
import {
  DEMO_CATALOGUE,
  DEMO_RECORDINGS,
  RECORDING_BY_RUN,
  RECORDING_BY_WORKFLOW,
  workflowById,
  type DemoRecording,
} from "./workflowRegistry";

/**
 * The DDQ Gap & Consistency Scan, kept as named exports because it is the
 * demo's centrepiece and several tests pin it by name. Both now come out of the
 * registry: the workflow is the recorded catalogue entry rather than a
 * hand-built object, and the 12 column ids and prompts are the database's own.
 */
const DDQ_WORKFLOW_ID = "builtin_lp_ddq_scan";

const ddq = RECORDING_BY_WORKFLOW.get(DDQ_WORKFLOW_ID);
if (!ddq) throw new Error("Demo fixtures: the DDQ scan recording is missing.");

export const DEMO_DDQ_WORKFLOW: Workflow = ddq.workflow;
export const DEMO_DDQ_RUN: WorkflowRun = ddq.run;
export const DEMO_DDQ_RUN_QUEUED: WorkflowRun = ddq.queued;
export const DEMO_DDQ_ROWS: string[] = ddq.rows;

/**
 * Whether the recorded run should animate.
 *
 * `useTabularRun` subscribes to a run's stream whenever it opens one, finished
 * or not (useTabularRun.ts:353). Replaying unconditionally would therefore
 * re-animate the recorded run every time a visitor opened it from history,
 * which is not what the product does and reads as broken. So the replay is
 * armed by the one thing that means "the visitor just started this run" — the
 * POST that starts it — and by nothing else.
 *
 * `replaying` exists because the run is fetched twice during a run: once by
 * `useTabularRun` on mount (which must not hand back the finished answers the
 * stream is about to deliver) and again when the terminal event arrives (which
 * must). `armed` alone cannot separate those, because the replay consumes it
 * before the second fetch.
 */
type ReplayPhase = "idle" | "armed" | "replaying";
let replayPhase: ReplayPhase = "idle";
/**
 * Which run was armed. With five recordings the phase alone is not enough:
 * arming the ODD screen must not make Side Letters animate, and a
 * `GET /api/runs/:id` for a run nobody started must still hand back its
 * finished recording while another run is mid-replay.
 */
let armedRunId: string | null = null;

/** Called by the run-start route: the visitor pressed Run on this run. */
export function armDemoRunReplay(runId: string): void {
  replayPhase = "armed";
  armedRunId = runId;
}

/** Called once by `replayDemoRun`; true only for the run that was just started. */
export function consumeDemoRunReplayArm(runId: string): boolean {
  if (replayPhase !== "armed" || armedRunId !== runId) return false;
  replayPhase = "replaying";
  return true;
}

/** Called when the replay finishes or is torn down. Idempotent. */
export function endDemoRunReplay(): void {
  replayPhase = "idle";
  armedRunId = null;
}

/** True while this specific run is armed or mid-replay. */
export function isReplayInFlight(runId: string): boolean {
  return replayPhase !== "idle" && armedRunId === runId;
}

/**
 * The run is a recording, so anything that would re-derive it — a fresh model
 * pass, a server-built spreadsheet, a new workflow — is refused with a sentence
 * rather than left to the generic 404. Wording says what the live product does,
 * because a prospect reading it is deciding whether the product does it at all.
 */
const RERUN_REFUSAL =
  "Re-running a cell issues a fresh model query against the source documents. " +
  "This demo replays one recorded run, so the answers you see are fixed — " +
  "every one of them still opens its cited page.";

const EXPORT_REFUSAL =
  "Exports are generated server-side from the live run. This demo runs " +
  "entirely in your browser with no backend, so there's nothing to build the " +
  "file from.";

const AUTHORING_REFUSAL =
  "Creating and editing workflows needs somewhere to save them, and this demo " +
  "has no backend. The built-in DDQ gap-and-consistency scan is here to run.";

/**
 * Placeholders. Task 5 replaces every one of these with the real product
 * copy; they exist only so this task's tests can run.
 */
const UNKNOWN_WORKFLOW_REFUSAL =
  "That workflow is not one of the built-in templates this fund workspace ships with.";

const UNKNOWN_RUN_REFUSAL =
  "That run is not one of the recordings this demo replays — open a workflow and press Run.";

function unrecordedRefusal(workflowId: string): string {
  return `The ${workflowById(workflowId)?.name ?? "requested"} workflow is not recorded in this demo.`;
}

function wrongFundRefusal(rec: DemoRecording): string {
  return `${rec.workflow.name} is recorded against another fund's workspace — open that fund to watch it run.`;
}

function refuse(message: string): never {
  throw new DemoRefusal(message);
}

export function registerWorkflowFixtures(): void {
  registerDemoRoutes([
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows$/,
      // Both demo funds are entity_type="fund", so workflow_store.py:87-94
      // serves them the same eight built-ins. Listing fewer would understate
      // the product; listing all eight is what makes seven of them refuse.
      handler: () => DEMO_CATALOGUE,
    },
    // (write refusals are registered at the end of this list)
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)$/,
      handler: (m) => workflowById(m[2]) ?? refuse(UNKNOWN_WORKFLOW_REFUSAL),
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)\/runs$/,
      // Keyed by deal, not just workflow: this is what makes Side Letters show
      // a run on Fund III and nothing on Fund IV — context isolation as the
      // product enforces it, not as a special case.
      handler: (m) => {
        const rec = RECORDING_BY_WORKFLOW.get(m[2]);
        return rec && rec.dealId === m[1] ? [rec.run] : [];
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/runs\/([^/]+)$/,
      // While this run's replay is armed or in flight it is a run in progress;
      // every other time — including while a *different* run replays — it is
      // the completed recording.
      handler: (m) => {
        const rec = RECORDING_BY_RUN.get(m[1]);
        if (!rec) return refuse(UNKNOWN_RUN_REFUSAL);
        return isReplayInFlight(rec.run.id) ? rec.queued : rec.run;
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)\/runs$/,
      // Arms *that workflow's* replay. `WorkflowsView` reads only `run.id` off
      // this response and then opens the run view, which subscribes — and that
      // subscription is what animates.
      handler: (m) => {
        const rec = RECORDING_BY_WORKFLOW.get(m[2]);
        if (!rec) return refuse(unrecordedRefusal(m[2]));
        if (rec.dealId !== m[1]) return refuse(wrongFundRefusal(rec));
        armDemoRunReplay(rec.run.id);
        return rec.queued;
      },
    },
    {
      method: "GET",
      // `subscribeRun` mints its stream token through `request(...)`, which
      // defaults to GET (lib/workflows.ts:403). Belt-and-braces: the demo
      // guard returns before the token is ever fetched.
      pattern: /^\/api\/runs\/([^/]+)\/stream-token$/,
      handler: () => ({ token: "demo-stream-token" }),
    },
    {
      method: "GET",
      // No caller in the app today (every run fetch goes through
      // lib/workflows.ts, which has no deal-level run list). Registered so a
      // deal-level "recent runs" surface cannot 404 into a blank panel.
      pattern: /^\/api\/deals\/([^/]+)\/runs$/,
      handler: (m) =>
        DEMO_RECORDINGS.filter((r) => r.dealId === m[1]).map((r) => r.run),
    },

    // ── Writes around the run, refused in the product's own words ──
    // Every one of these sits on the centrepiece surface, where the generic
    // "Not available in demo" band is most damaging: a prospect watching the
    // recorded scan is exactly the person who then clicks Excel or Rerun.
    {
      method: "GET",
      pattern: /^\/api\/runs\/[^/]+\/export\.(xlsx|docx)$/,
      handler: () => refuse(EXPORT_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/runs\/[^/]+\/cells\/[^/]+\/retry$/,
      handler: () => refuse(RERUN_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/runs\/[^/]+\/columns\/[^/]+\/retry$/,
      handler: () => refuse(RERUN_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/runs\/[^/]+\/cancel$/,
      // Refusing leaves the replay running, which is the honest outcome: there
      // is no server-side run to stop.
      handler: () => refuse(RERUN_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/workflows$/,
      handler: () => refuse(AUTHORING_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/workflows\/[^/]+\/clone$/,
      handler: () => refuse(AUTHORING_REFUSAL),
    },
  ]);
}
