# More LP Workflows in the Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-06-demo-more-lp-workflows-design.md`

**Goal:** Extend demo mode from one runnable workflow to five, and list the full eight-template LP built-in catalogue, so a prospect sees what a real fund workspace shows.

**Architecture:** The demo's single-recording assumptions are replaced by a registry. The eight-template catalogue is *recorded* from the live backend rather than hand-transcribed; each recorded run resolves its workflow out of that catalogue. The replay engine takes a run id instead of importing one run, and the arm state machine remembers *which* run was armed, so arming workflow A can never play workflow B. Everything else — the fixture transport, the schedule derivation, the concurrency overlap — is unchanged.

**Tech Stack:** TypeScript, React, Vitest, Vite. Node script (`scripts/record_demo_run.mjs`) against the FastAPI backend running from `backend/.venv`.

## Global Constraints

- **Frontend-only.** No backend changes. No new corpus documents.
- **No LLM at demo time.** Every run in the demo is a frozen recording replayed from JSON.
- **Never hand-edit a recording.** Recording rather than authoring is what makes citations correct by construction. Remediation is **delete-only** — a weak cell is dropped, never rewritten.
- **Refusals name what the live product does.** Never fall through to the generic `"Not available in demo"` band. Every refusal `detail` must exceed 40 characters (`coverage.test.ts` asserts this).
- **Built-in column ids are stable** (CLAUDE.md invariant 4). Ids come from the recording, never from inferring order.
- **Fund IV** = `brightwater_iv` = "Brightwater Capital Partners IV". **Fund III** = `brightwater_iii` = "Brightwater Capital Partners III".
- **Tests:** `cd frontend && npm test` (vitest run). Typecheck+build: `cd frontend && npx tsc --noEmit && npm run build`.
- **Phase 2 prerequisites, every time:** backend running from `backend/.venv`; `GEMINI_API_KEY` in **`backend/.env`** (not the repo root); a backup of `backend/data/vyntic.db` before each recording, because recording persists runs to the dev database.

## Phase boundary

**Phase 1 (Tasks 1–7)** makes the demo multi-workflow-capable and lists all eight built-ins. It needs the backend up for exactly one read-only `GET` (Task 1) and makes **no model calls**. It ships a working demo on its own: eight workflows listed, DDQ runnable, seven refusing in their own words.

**Phase 2 (Tasks 8–13)** turns four of those refusals into recordings. Every task in it makes **real Gemini API calls** and **writes to the dev database**. Do not begin Phase 2 without explicit go-ahead.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/demo/fixtures/recorded-workflows.json` | **New.** Frozen `GET /deals/brightwater_iv/workflows` response: eight templates, real column ids, real prompts. |
| `frontend/src/demo/fixtures/workflowRegistry.ts` | **New.** Catalogue + recordings + the two lookup maps. Owns the JSON casts and the `queued` derivation. No routes, no refusal copy. |
| `frontend/src/demo/fixtures/workflowRegistry.test.ts` | **New.** Catalogue completeness: every built-in resolves to a recording or a refusal. Shape and citation walkers over every recording. |
| `frontend/src/demo/fixtures/workflows.ts` | **Modify.** Routes, refusal copy, arm state machine. Loses `DDQ_COLUMNS`, `columnPrompt`, `DDQ_WORKFLOW_COLUMNS`, the hand-built `DEMO_DDQ_WORKFLOW` object and `DEMO_DDQ_RUN_QUEUED`. |
| `frontend/src/demo/runReplay.ts` | **Modify.** `replayDemoRun(runId, onEvent)`; resolves its recording from the registry. |
| `frontend/src/lib/workflows.ts` | **Modify.** One line: pass `runId` into `replayDemoRun`. |
| `frontend/src/demo/coverage.test.ts` | **Modify.** Real workflow ids; reads and refusals for the new surfaces. |
| `frontend/src/demo/fixtures/workflows.test.ts` | **Modify.** DDQ assertions now prove the recording matches the deleted transcription. |
| `frontend/src/demo/runReplay.test.ts` | **Modify.** Parameterised over recordings; adds the cross-workflow isolation test. |
| `scripts/record_demo_run.mjs` | **Modify.** Per-workflow config (deal, documents, output path) + `--catalogue` mode. |

---

## Task 1: Record the eight-template catalogue

Freeze the real workflow list instead of transcribing it. This is a read-only `GET` against a locally running backend — no model calls, no writes.

**Files:**
- Modify: `scripts/record_demo_run.mjs:24-48`
- Create: `frontend/src/demo/fixtures/recorded-workflows.json`

**Interfaces:**
- Produces: `recorded-workflows.json` — a JSON array of 8 `Workflow` objects (`id`, `deal_id`, `entity_type`, `name`, `description`, `type`, `row_source`, `output_format`, `is_builtin`, `cloned_from`, `created_by`, `created_at`, `updated_at`, `stages`, `columns`, `variables`). Task 2 consumes it.

- [ ] **Step 1: Add `--catalogue` mode to the recorder**

Replace the argument handling and output map at `scripts/record_demo_run.mjs:29-48` with:

```js
const argv = process.argv.slice(2);
const CATALOGUE_MODE = argv.includes("--catalogue");
const [email, password, workflowName = "DDQ Gap & Consistency Scan"] = argv.filter(
  (a) => a !== "--catalogue"
);
const DEAL_ID = "brightwater_iv";
const CATALOGUE_OUT = "frontend/src/demo/fixtures/recorded-workflows.json";

const OUTPUTS = {
  "DDQ Gap & Consistency Scan": "frontend/src/demo/fixtures/recorded-ddq-scan-run.json",
  "ODD Screen": "frontend/src/demo/fixtures/recorded-odd-run.json",
};

if (!email || !password) {
  console.error(
    "usage: node scripts/record_demo_run.mjs <email> <password> [workflow-name]\n" +
      "       node scripts/record_demo_run.mjs <email> <password> --catalogue"
  );
  process.exit(1);
}

const out = CATALOGUE_MODE ? CATALOGUE_OUT : OUTPUTS[workflowName];
if (!out) {
  console.error(`no output path configured for workflow "${workflowName}"`);
  process.exit(1);
}
```

- [ ] **Step 2: Write the catalogue branch**

Immediately after the `const workflows = await api(...)` line (currently `record_demo_run.mjs:64`), insert:

```js
if (CATALOGUE_MODE) {
  // Both demo funds are entity_type="fund", so workflow_store.py:87-94 serves
  // them the same eight built-ins — one dump covers both workspaces.
  const builtins = workflows.filter((w) => w.is_builtin);
  if (builtins.length !== 8)
    throw new Error(
      `expected 8 built-in fund workflows, got ${builtins.length} — ` +
        `workflow_seed_lp.py changed, or the DB is not reconciled`
    );
  writeFileSync(out, JSON.stringify(builtins, null, 2));
  console.log(`wrote ${out} — ${builtins.length} templates`);
  process.exit(0);
}
```

- [ ] **Step 3: Start the backend**

From the repo root (Docker is not installed on this machine — run the venv directly):

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Leave it running in a second shell. Confirm with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs` → `200`.

- [ ] **Step 4: Dump the catalogue**

```bash
node scripts/record_demo_run.mjs <admin-email> <admin-password> --catalogue
```

Expected: `wrote frontend/src/demo/fixtures/recorded-workflows.json — 8 templates`.

- [ ] **Step 5: Verify the dump against the spec's table**

```bash
node -e "const w=require('./frontend/src/demo/fixtures/recorded-workflows.json'); console.table(w.map(x=>({id:x.id,name:x.name,type:x.type,row_source:x.row_source,cols:x.columns.length,stages:x.stages.length})))"
```

Expected — exactly these eight, matching the spec's "What already exists" table:

| name | type | row_source | columns |
|---|---|---|---|
| DDQ Gap & Consistency Scan | tabular | multi_doc_synthesis | 12 |
| Fund Brief | tabular | multi_doc_synthesis | 11 |
| Track Record Grid | tabular | one_doc_per_row | 11 |
| Fund Terms Extractor | tabular | multi_doc_synthesis | 12 |
| ODD Screen | tabular | multi_doc_synthesis | 8 |
| LPA / ILPA-Alignment Review | tabular | multi_doc_synthesis | 8 |
| Side Letter Obligation Extractor | tabular | one_doc_per_row | 6 |
| Fund Commitment Memo | assistant | — | 0 columns, 4 stages |

If a count differs, **stop and report** — the backend seed has drifted from the spec and the rest of the plan's column-count assertions are wrong.

- [ ] **Step 6: Commit**

```bash
git add scripts/record_demo_run.mjs frontend/src/demo/fixtures/recorded-workflows.json
git commit -m "feat(demo): record the eight-template LP workflow catalogue"
```

---

## Task 2: The registry, and the DDQ workflow read out of it

Replace the hand-transcribed `DEMO_DDQ_WORKFLOW` with a catalogue lookup. The existing golden-table test is what proves the swap changed nothing.

**Files:**
- Create: `frontend/src/demo/fixtures/workflowRegistry.ts`
- Modify: `frontend/src/demo/fixtures/workflows.ts:1-114` (delete the transcription and `DEMO_DDQ_RUN_QUEUED`, re-export from the registry)
- Modify: `frontend/src/demo/fixtures/workflows.test.ts:176-187` (the `columnPrompt` test)
- Test: `frontend/src/demo/fixtures/workflowRegistry.test.ts` (created in Task 6; this task is covered by the existing `workflows.test.ts`)

**Interfaces:**
- Consumes: `recorded-workflows.json` (Task 1).
- Produces, from `@/demo/fixtures/workflowRegistry`:
  - `DEMO_CATALOGUE: Workflow[]`
  - `interface DemoRecording { workflowId: string; dealId: string; workflow: Workflow; run: WorkflowRun; queued: WorkflowRun; rows: string[] }`
  - `DEMO_RECORDINGS: DemoRecording[]`
  - `RECORDING_BY_WORKFLOW: Map<string, DemoRecording>`
  - `RECORDING_BY_RUN: Map<string, DemoRecording>`
  - `workflowById(id: string): Workflow | undefined`

- [ ] **Step 1: Write the registry**

Create `frontend/src/demo/fixtures/workflowRegistry.ts`:

```ts
import type { Workflow, WorkflowRun } from "@/lib/workflows";
import catalogue from "./recorded-workflows.json";
import ddqScanRun from "./recorded-ddq-scan-run.json";

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
export const DEMO_RECORDINGS: DemoRecording[] = [recording(ddqScanRun)];

export const RECORDING_BY_WORKFLOW = new Map(
  DEMO_RECORDINGS.map((r) => [r.workflowId, r])
);
export const RECORDING_BY_RUN = new Map(DEMO_RECORDINGS.map((r) => [r.run.id, r]));
```

- [ ] **Step 2: Run the existing suite to see it fail on nothing yet**

Run: `cd frontend && npx vitest run src/demo`
Expected: PASS — the registry is not yet wired in. This confirms the new module compiles and its `recording()` invariant holds (a throw at import time would fail every demo test).

- [ ] **Step 3: Delete the transcription from `workflows.ts`**

In `frontend/src/demo/fixtures/workflows.ts`, delete lines 1–114 (the `recorded` import, `DEMO_DDQ_RUN`, `DEMO_DDQ_ROWS`, `DDQ_COLUMNS`, `columnPrompt`, `DDQ_WORKFLOW_COLUMNS`, `DEMO_DDQ_WORKFLOW`, `DEMO_DDQ_RUN_QUEUED`) and replace with:

```ts
import type { Workflow, WorkflowRun } from "@/lib/workflows";
import { DemoRefusal, registerDemoRoutes } from "@/demo/transport";
import { DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import {
  DEMO_CATALOGUE,
  DEMO_RECORDINGS,
  RECORDING_BY_RUN,
  RECORDING_BY_WORKFLOW,
  workflowById,
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
```

Leave the rest of the file (the arm state machine from line 116, the refusal strings, `registerWorkflowFixtures`) untouched for now — Tasks 3–5 rewrite it.

- [ ] **Step 4: Fix the `columnPrompt` test's scope**

`workflows.test.ts:176-187` asserts every DDQ column prompt contains its upper-cased label. That was pinning a deleted helper; it now pins the backend's real prompt string. Keep it — it is a true fact about `workflow_seed_lp.py:26` — but rewrite the comment so the next reader is not sent looking for `columnPrompt`. Replace the test body's comment block:

```ts
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
```

- [ ] **Step 5: Run the DDQ suite — this is the proof**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts`
Expected: PASS, **including** `"pairs every column id with the label the database gave it"` (`workflows.test.ts:166`). That test compares the workflow's columns against `DDQ_COLUMN_GOLDEN`, a table transcribed from the seeded DB dump. It passing against the *recording* is what proves the recording matches the transcription this task deleted — behaviour unchanged, proven rather than asserted.

If it fails, the recording and the golden disagree: **stop and report**, do not edit the golden.

- [ ] **Step 6: Typecheck and commit**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

```bash
git add frontend/src/demo/fixtures/workflowRegistry.ts frontend/src/demo/fixtures/workflows.ts frontend/src/demo/fixtures/workflows.test.ts
git commit -m "refactor(demo): read the DDQ workflow from the recorded catalogue"
```

---

## Task 3: Give the arm state machine and the replay a run identity

Today `armDemoRunReplay()` means "a run started" with no idea which. With five recordings that is the bug the registry exists to prevent.

**Files:**
- Modify: `frontend/src/demo/fixtures/workflows.ts` (the arm state machine, currently lines 116–150)
- Modify: `frontend/src/demo/runReplay.ts`
- Modify: `frontend/src/lib/workflows.ts:405`
- Test: `frontend/src/demo/runReplay.test.ts`

**Interfaces:**
- Consumes: `RECORDING_BY_RUN`, `DemoRecording` (Task 2).
- Produces:
  - `armDemoRunReplay(runId: string): void`
  - `consumeDemoRunReplayArm(runId: string): boolean`
  - `endDemoRunReplay(): void` — unchanged signature
  - `isReplayInFlight(runId: string): boolean` — true while `runId` is armed or replaying
  - `replayDemoRun(runId: string, onEvent: (event: RunStreamEvent) => void): () => void`

- [ ] **Step 1: Write the failing isolation test**

Append to `frontend/src/demo/runReplay.test.ts`, at the end of the file:

```ts
describe("recording isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDemoRoutes();
    registerWorkflowFixtures();
    endDemoRunReplay();
  });

  afterEach(() => {
    vi.useRealTimers();
    endDemoRunReplay();
    sessionStorage.clear();
  });

  it("plays the run it was asked for, not whichever was recorded first", () => {
    for (const rec of DEMO_RECORDINGS) {
      endDemoRunReplay();
      armDemoRunReplay(rec.run.id);
      const events: RunStreamEvent[] = [];
      const stop = replayDemoRun(rec.run.id, (e) => events.push(e));
      vi.advanceTimersByTime(120_000);
      stop();

      const last = events[events.length - 1];
      expect(last.type, rec.workflowId).toBe("run");
      if (last.type !== "run") throw new Error("unreachable");
      expect(last.run_id, rec.workflowId).toBe(rec.run.id);
      expect(
        cellEvents(events, "complete").length,
        rec.workflowId
      ).toBe(rec.run.cells.length);
    }
  });

  it("does not animate a run that was not the one armed", () => {
    // The assertion the registry exists to protect. With one recording this is
    // vacuous on the cross-workflow axis but still pins the arm's identity
    // check: arming a run id and subscribing to a different one must not play.
    const [first] = DEMO_RECORDINGS;
    armDemoRunReplay("some-other-run-id");

    const events: RunStreamEvent[] = [];
    const stop = replayDemoRun(first.run.id, (e) => events.push(e));
    vi.advanceTimersByTime(120_000);
    stop();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("snapshot");
  });

  it("throws rather than inventing a run for an unknown id", () => {
    expect(() => replayDemoRun("not-a-recorded-run", () => {})).toThrow(
      /not-a-recorded-run/
    );
  });
});
```

Add `DEMO_RECORDINGS` to the imports at the top of the file:

```ts
import { DEMO_RECORDINGS } from "./fixtures/workflowRegistry";
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/demo/runReplay.test.ts`
Expected: FAIL — `armDemoRunReplay` takes no argument and `replayDemoRun` takes one, so this is a TypeScript error surfaced by vitest as a transform failure.

- [ ] **Step 3: Give the arm an identity**

In `frontend/src/demo/fixtures/workflows.ts`, replace the state machine block (currently lines 132–150, from `type ReplayPhase` through `endDemoRunReplay`) with:

```ts
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
```

Leave the doc comment above `type ReplayPhase` (lines 116–131) in place — it still explains why the arm exists.

- [ ] **Step 4: Parameterise the replay**

In `frontend/src/demo/runReplay.ts`, replace the import block and the `replayDemoRun` signature/body header. Imports become:

```ts
import type { RunStreamEvent, TabularCell } from "@/lib/workflows";
import {
  armDemoRunReplay,
  consumeDemoRunReplayArm,
  endDemoRunReplay,
} from "./fixtures/workflows";
import { RECORDING_BY_RUN } from "./fixtures/workflowRegistry";
```

Change the signature and the first lines of the body:

```ts
export function replayDemoRun(
  runId: string,
  onEvent: (event: RunStreamEvent) => void
): () => void {
  const recording = RECORDING_BY_RUN.get(runId);
  if (!recording) {
    throw new Error(
      `Demo replay: no recording for run "${runId}". The run-start route and ` +
        `the registry have drifted apart.`
    );
  }
  const { run, queued, workflow } = recording;

  const armed = consumeDemoRunReplayArm(runId);
  let cancelled = false;
  let finished = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
```

Then, throughout the rest of the function, substitute:
- `DEMO_DDQ_RUN` → `run`
- `DEMO_DDQ_RUN_QUEUED` → `queued`
- `DEMO_DDQ_WORKFLOW` → `workflow`
- `if (!finished) armDemoRunReplay();` → `if (!finished) armDemoRunReplay(runId);`

And in the column-drift guard, widen the message so it names the workflow:

```ts
    if (!cell) {
      throw new Error(
        `Demo replay: the recorded run for "${workflow.name}" has no cell for ` +
          `workflow column "${column.label}" (${column.id}). The recording and ` +
          `the catalogue have drifted apart — re-record the run.`
      );
    }
```

Update the function's doc comment: it currently says "Replays the recorded DDQ Gap & Consistency Scan" and cites the specific 6.75 s / concurrency-4 figures. Rewrite the first paragraph to:

```
 * Replays a recorded run as a live-looking stream.
 *
 * The schedule is not invented: every event fires at its real offset from
 * `run.started_at`, so the replay takes the wall clock the run actually took
 * and reproduces the executor's concurrency for free — cells start together,
 * and each later one starts as an earlier one finishes. That overlap is why
 * completions arrive out of column order, and it is the part that makes the
 * animation read as genuine rather than as a progress bar.
```

Leave the two paragraphs after it unchanged.

- [ ] **Step 5: Pass the run id at the call site**

`frontend/src/lib/workflows.ts:405`:

```ts
      stop = replayDemoRun(runId, onEvent);
```

- [ ] **Step 6: Fix the existing replay tests' arming calls**

In `runReplay.test.ts`, `collect()` and the `beforeEach` arming both need the id. Replace:

```ts
function collect(): { events: RunStreamEvent[]; stop: () => void } {
  const events: RunStreamEvent[] = [];
  const stop = replayDemoRun(DEMO_DDQ_RUN.id, (e) => events.push(e));
  return { events, stop };
}
```

and at `runReplay.test.ts:51`:

```ts
    beforeEach(() => armDemoRunReplay(DEMO_DDQ_RUN.id));
```

The drift test at `runReplay.test.ts:117-135` pushes a ghost column onto `DEMO_DDQ_WORKFLOW.columns` and calls `replayDemoRun(() => {})`. Update its call and its expected message:

```ts
        expect(() => replayDemoRun(DEMO_DDQ_RUN.id, () => {})).toThrow(
          /ghost-column-not-in-the-recording/
        );
```

- [ ] **Step 7: Run the replay suite**

Run: `cd frontend && npx vitest run src/demo/runReplay.test.ts`
Expected: PASS, all suites including the three new isolation tests.

Note the test at `runReplay.test.ts:327` ("reports the run as still in progress while the replay is in flight") will still pass only once Task 4 rewires `GET /api/runs/:id` onto `isReplayInFlight`. If it fails here with `midRun.status === "complete"`, that is expected and Task 4 fixes it — record the failure and continue rather than patching the route early.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/demo/runReplay.ts frontend/src/demo/runReplay.test.ts frontend/src/demo/fixtures/workflows.ts frontend/src/lib/workflows.ts
git commit -m "refactor(demo): key the replay and its arming on a run id"
```

---

## Task 4: Catalogue-driven routes

**Files:**
- Modify: `frontend/src/demo/fixtures/workflows.ts` (`registerWorkflowFixtures`, currently lines 176–267)
- Test: `frontend/src/demo/fixtures/workflows.test.ts`

**Interfaces:**
- Consumes: `DEMO_CATALOGUE`, `RECORDING_BY_WORKFLOW`, `RECORDING_BY_RUN`, `workflowById` (Task 2); `isReplayInFlight`, `armDemoRunReplay` (Task 3).
- Produces: no new exports — route behaviour only.

- [ ] **Step 1: Write the failing route tests**

Append to the `describe("workflow fixtures", ...)` block in `workflows.test.ts`:

```ts
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
```

Extend the imports at the top of `workflows.test.ts`:

```ts
import { registerWorkflowFixtures, DEMO_DDQ_RUN, DEMO_DDQ_WORKFLOW, DEMO_DDQ_ROWS, endDemoRunReplay } from "./workflows";
import {
  DEMO_CATALOGUE,
  DEMO_RECORDINGS,
  RECORDING_BY_WORKFLOW,
} from "./workflowRegistry";
import type { Workflow, WorkflowRun } from "@/lib/workflows";
```

(replace the existing `import type { WorkflowRun } ...` line rather than adding a second one).

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts`
Expected: FAIL — the list route returns 1 workflow, not 8.

- [ ] **Step 3: Rewrite the read routes**

In `registerWorkflowFixtures`, replace the first six route entries (list, detail, runs, run-by-id, run-start, deal-level runs — currently lines 178–228) with:

```ts
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
```

`UNKNOWN_WORKFLOW_REFUSAL`, `UNKNOWN_RUN_REFUSAL`, `unrecordedRefusal` and `wrongFundRefusal` are written in Task 5. To keep this task's tests runnable, add these placeholders next to the existing refusal strings now and let Task 5 replace them with the real copy:

```ts
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
```

Import the `DemoRecording` type alongside the registry values.

- [ ] **Step 4: Run the workflow and replay suites**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts src/demo/runReplay.test.ts`
Expected: PASS, including `"reports the run as still in progress while the replay is in flight"` which this task's `isReplayInFlight` wiring fixes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/demo/fixtures/workflows.ts frontend/src/demo/fixtures/workflows.test.ts
git commit -m "feat(demo): serve the whole workflow catalogue, runs keyed by fund"
```

---

## Task 5: Refusals that name what the live product does

**Files:**
- Modify: `frontend/src/demo/fixtures/workflows.ts` (the placeholder refusals from Task 4, plus `AUTHORING_REFUSAL`)
- Test: `frontend/src/demo/fixtures/workflows.test.ts`

**Interfaces:**
- Consumes: `DemoRecording`, `workflowById`, `RECORDING_BY_WORKFLOW` (Task 2).
- Produces: `UNRECORDED_REFUSALS: Record<string, string>` — exported so the completeness test in Task 6 can assert every catalogue entry is covered.

- [ ] **Step 1: Write the failing refusal tests**

Append to the `describe("writes around the recorded run", ...)` block in `workflows.test.ts`:

```ts
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
```

Add `DEMO_CATALOGUE` and `DEMO_RECORDINGS` to that describe block's available imports (already added at the top of the file in Task 4) and `demoFetch` (already imported).

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts -t "unrecorded built-in"`
Expected: FAIL — the placeholder copy contains neither "Brief", "TVPI" nor "checkpoint".

- [ ] **Step 3: Write the real refusal copy**

Replace the Task 4 placeholders in `workflows.ts` with:

```ts
/**
 * The three built-ins the demo lists but cannot run. Each refusal describes the
 * workflow's real output rather than saying "not available", because a prospect
 * reading it is deciding whether the product does that at all.
 *
 * Keyed by workflow id. `workflowRegistry.test.ts` asserts every catalogue
 * entry is either recorded or in this table, so a ninth built-in appearing in
 * the backend fails the build instead of shipping as a dead button.
 */
export const UNRECORDED_REFUSALS: Record<string, string> = {
  [BUILTIN_FUND_BRIEF]:
    "The Fund Brief workflow writes the eleven-section brief you can already " +
    "read on this fund's Brief tab — strategy, team, terms, track record and " +
    "the rest, every line carrying its citation. The demo ships that brief as " +
    "a finished document rather than re-deriving it, so there is nothing here " +
    "to run.",
  [BUILTIN_TRACK_RECORD]:
    "Track Record Grid builds one row per prior fund from the track-record " +
    "workbook, then reconciles each reported TVPI against DPI plus RVPI and " +
    "flags the ones that do not tie. It is investment diligence rather than " +
    "operational, and this demo replays the operational runs.",
  [BUILTIN_COMMITMENT_MEMO]:
    "The Fund Commitment Memo is a four-stage assistant workflow: it drafts, " +
    "pauses at analyst checkpoints for your edits, and exports a Word memo. " +
    "That is a different surface from the grids this demo replays, not a " +
    "longer one.",
};
```

Add the id constants next to `DDQ_WORKFLOW_ID` near the top of the file. Read the real ids out of the catalogue rather than guessing them:

```bash
node -e "require('./frontend/src/demo/fixtures/recorded-workflows.json').forEach(w=>console.log(w.id, '|', w.name))"
```

```ts
const BUILTIN_FUND_BRIEF = "builtin_lp_fund_brief";
const BUILTIN_TRACK_RECORD = "builtin_lp_track_record";
const BUILTIN_COMMITMENT_MEMO = "builtin_lp_commitment_memo";
```

Then replace the two helper functions:

```ts
/** Fund display names, for refusals that tell the visitor where to go. */
const FUND_NAMES: Record<string, string> = {
  [DEMO_FUND_IV_ID]: "Brightwater Capital Partners IV",
  [DEMO_FUND_III_ID]: "Brightwater Capital Partners III",
};

function unrecordedRefusal(workflowId: string): string {
  return (
    UNRECORDED_REFUSALS[workflowId] ??
    "That workflow is one of this fund's built-in templates, but the demo has " +
      "no recording of it to replay. Every run you see here is a frozen real " +
      "model pass, not a simulation."
  );
}

/**
 * The catalogue lists all eight workflows on both funds, so pressing Run on a
 * workflow recorded elsewhere has to answer. Wording turns the refusal into
 * navigation: it names the workspace to open.
 */
function wrongFundRefusal(rec: DemoRecording): string {
  return (
    `${rec.workflow.name} is recorded against ${FUND_NAMES[rec.dealId]} — ` +
    `open that workspace to watch it run. Runs stay inside the fund whose ` +
    `documents they read, exactly as they do in the product.`
  );
}
```

- [ ] **Step 4: Widen `AUTHORING_REFUSAL`**

It currently says "The built-in DDQ gap-and-consistency scan is here to run", which is false once five workflows run. Replace its last sentence:

```ts
const AUTHORING_REFUSAL =
  "Creating and editing workflows needs somewhere to save them, and this demo " +
  "has no backend. The built-in LP templates are all listed, and the recorded " +
  "ones are here to run.";
```

- [ ] **Step 5: Run the suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/demo/fixtures/workflows.ts frontend/src/demo/fixtures/workflows.test.ts
git commit -m "feat(demo): refuse unrecorded and wrong-fund runs in the product's words"
```

---

## Task 6: Completeness guard and coverage sweep

The guard that makes a ninth backend built-in fail the build, plus the coverage test's real workflow ids.

**Files:**
- Create: `frontend/src/demo/fixtures/workflowRegistry.test.ts`
- Modify: `frontend/src/demo/coverage.test.ts:25-26, 36-38, 79-80`

**Interfaces:**
- Consumes: everything exported by `workflowRegistry.ts` (Task 2) and `UNRECORDED_REFUSALS` (Task 5).

- [ ] **Step 1: Write the completeness and walker tests**

Create `frontend/src/demo/fixtures/workflowRegistry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEMO_CATALOGUE,
  DEMO_RECORDINGS,
  RECORDING_BY_RUN,
  RECORDING_BY_WORKFLOW,
} from "./workflowRegistry";
import { UNRECORDED_REFUSALS } from "./workflows";
import { DEMO_DOCS_BY_FILENAME, DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import { asShape } from "@/lib/cellShapes";
import type { WorkflowRun } from "@/lib/workflows";

describe("the recorded catalogue", () => {
  it("holds the eight LP built-ins the backend seeds for fund workspaces", () => {
    expect(DEMO_CATALOGUE).toHaveLength(8);
    for (const w of DEMO_CATALOGUE) {
      expect(w.entity_type, w.name).toBe("fund");
      expect(w.is_builtin, w.name).toBe(true);
      expect(w.deal_id, w.name).toBeNull();
    }
    expect(new Set(DEMO_CATALOGUE.map((w) => w.id)).size).toBe(8);
  });

  /**
   * The guard the spec exists for. A ninth built-in appearing in
   * workflow_seed_lp.py and landing in a re-recorded catalogue must fail here,
   * rather than shipping as a button that does nothing a prospect can read.
   */
  it("resolves every built-in to either a recording or a refusal", () => {
    for (const w of DEMO_CATALOGUE) {
      const recorded = RECORDING_BY_WORKFLOW.has(w.id);
      const refused = typeof UNRECORDED_REFUSALS[w.id] === "string";
      expect(
        recorded !== refused,
        `${w.name} (${w.id}) is ${recorded && refused ? "both recorded and refused" : "neither recorded nor refused"}`
      ).toBe(true);
    }
  });

  it("refuses only workflows that are actually in the catalogue", () => {
    const ids = new Set(DEMO_CATALOGUE.map((w) => w.id));
    for (const id of Object.keys(UNRECORDED_REFUSALS)) {
      expect(ids.has(id), `refusal for unknown workflow ${id}`).toBe(true);
    }
  });

  it("indexes each recording by both its workflow and its run", () => {
    expect(RECORDING_BY_WORKFLOW.size).toBe(DEMO_RECORDINGS.length);
    expect(RECORDING_BY_RUN.size).toBe(DEMO_RECORDINGS.length);
    for (const rec of DEMO_RECORDINGS) {
      expect(RECORDING_BY_WORKFLOW.get(rec.workflowId)).toBe(rec);
      expect(RECORDING_BY_RUN.get(rec.run.id)).toBe(rec);
      expect([DEMO_FUND_IV_ID, DEMO_FUND_III_ID]).toContain(rec.dealId);
    }
  });
});

/**
 * The recordings are the one place a JSON import crosses into typed code, and
 * those casts are claims rather than checks. These walkers are the checks, and
 * they run over every recording — so a re-recording that drops a field or cites
 * a page that does not exist fails here rather than blanking a surface in front
 * of a prospect.
 */
function assertRunShape(run: WorkflowRun, where: string): void {
  expect(typeof run.id, where).toBe("string");
  expect(typeof run.workflow_id, where).toBe("string");
  expect(typeof run.deal_id, where).toBe("string");
  expect(typeof run.run_number, where).toBe("number");
  expect(run.status, where).toBe("complete");
  expect(Array.isArray(run.document_ids), where).toBe(true);
  for (const id of run.document_ids) expect(typeof id, where).toBe("string");
  expect(run.started_by === null || typeof run.started_by === "number", where).toBe(true);
  expect(typeof run.started_at, where).toBe("string");
  expect(typeof run.completed_at, where).toBe("string");
  expect(Array.isArray(run.cells), where).toBe(true);
  expect(Array.isArray(run.stage_outputs), where).toBe(true);

  for (const cell of run.cells) {
    const at = `${where} cell ${cell.id}`;
    expect(typeof cell.id, at).toBe("string");
    expect(typeof cell.run_id, at).toBe("string");
    expect(typeof cell.row_key, at).toBe("string");
    expect(typeof cell.column_id, at).toBe("string");
    expect(cell.status, at).toBe("complete");
    expect(cell.error_message, at).toBeNull();
    expect(typeof cell.answer, at).toBe("string");
    expect(cell.answer_display.length, at).toBeGreaterThan(0);
    expect(
      cell.answer_formatted === null || asShape(cell.answer_formatted) !== null,
      `${at} answer_formatted is neither null nor a tagged shape`
    ).toBe(true);
    expect(Array.isArray(cell.citations), at).toBe(true);
    expect(typeof cell.model, at).toBe("string");
    expect(typeof cell.fallback, at).toBe("boolean");
    expect(typeof cell.duration_ms, at).toBe("number");
    expect(typeof cell.started_at, at).toBe("string");
    expect(typeof cell.completed_at, at).toBe("string");

    for (const cite of cell.citations) {
      if (cite === null) continue;
      expect(typeof cite.source_file, at).toBe("string");
      expect(typeof cite.page, at).toBe("number");
      expect(typeof cite.text_snippet, at).toBe("string");
      expect(typeof cite.deal_id, at).toBe("string");
      expect(["extracted", "derived"], at).toContain(cite.kind);
      expect("span_label" in cite, at).toBe(true);
      expect(cite.span_label === null || typeof cite.span_label === "string", at).toBe(true);
    }
  }
}

describe.each(DEMO_RECORDINGS.map((r) => [r.workflow.name, r] as const))(
  "recording: %s",
  (name, rec) => {
    it("matches the real API shape at runtime, field by field", () => {
      assertRunShape(rec.run, name);
    });

    it("cites only real corpus files at pages inside those files", () => {
      let cited = 0;
      for (const cell of rec.run.cells) {
        for (const cite of cell.citations.filter(Boolean)) {
          cited += 1;
          const doc = DEMO_DOCS_BY_FILENAME[cite!.source_file];
          expect(doc, `unknown source_file ${cite!.source_file}`).toBeDefined();
          expect(doc.deal_id, `${cite!.source_file} belongs to another fund`).toBe(rec.dealId);
          if (cite!.source_file.endsWith(".xlsx")) {
            // Spreadsheets have no pages; page 0 is the sheet-level convention.
            expect(cite!.page, cite!.source_file).toBe(0);
          } else {
            expect(cite!.page, cite!.source_file).toBeGreaterThan(0);
            expect(cite!.page, cite!.source_file).toBeLessThanOrEqual(doc.page_count);
          }
        }
      }
      // Every recording must actually cite something, or it is prose.
      expect(cited, name).toBeGreaterThan(0);
    });

    it("runs against documents that exist in its own fund's corpus", () => {
      const own = new Set(
        Object.values(DEMO_DOCS_BY_FILENAME)
          .filter((d) => d.deal_id === rec.dealId)
          .map((d) => d.doc_id)
      );
      for (const id of rec.run.document_ids) {
        expect(own.has(id), `${name}: unknown document_id ${id}`).toBe(true);
      }
    });

    it("covers every one of its workflow's columns, in every row", () => {
      const columnIds = rec.workflow.columns.map((c) => c.id);
      expect(rec.run.cells).toHaveLength(columnIds.length * rec.rows.length);
      for (const row of rec.rows) {
        const inRow = rec.run.cells.filter((c) => c.row_key === row).map((c) => c.column_id);
        expect(inRow, `${name} / ${row}`).toEqual(columnIds);
      }
    });
  }
);
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflowRegistry.test.ts`
Expected: PASS. If `"resolves every built-in to either a recording or a refusal"` fails, a catalogue id in `UNRECORDED_REFUSALS` is wrong — re-read them from the JSON, do not weaken the test.

- [ ] **Step 3: Delete the walkers this file replaced**

`workflows.test.ts` now duplicates two of these. Delete from it:
- `assertRunShape` (lines 21–101) and the test that calls it, `"matches the real API shape at runtime, field by field"` (lines 214–216);
- `"cites only real corpus files at pages inside those files"` (lines 218–235) — the `expect(cited).toBe(59)` count in it is DDQ-specific and becomes wrong the moment a second recording lands;
- `"runs against documents that exist in the fund's corpus"` (lines 237–244).

All three now run over **every** recording in `workflowRegistry.test.ts` rather than only the DDQ one. Drop the now-unused `asShape` and `WorkflowRun` imports if nothing else in the file uses them.

Keep everything else in `workflows.test.ts`: the golden column table, the row/cell counts and the route tests are DDQ-specific claims that belong with the DDQ fixture.

- [ ] **Step 4: Give `coverage.test.ts` the real ids**

`coverage.test.ts:26` uses `const WORKFLOW_ID = "ddq_scan"`, which worked only because the routes ignored the id. Replace lines 25–26 with:

```ts
const RUN_ID = "0a15ef21994743d88de18935351392eb";
const WORKFLOW_ID = "builtin_lp_ddq_scan";
/** A built-in the demo lists but does not record — its Run must still answer. */
const UNRECORDED_WORKFLOW_ID = "builtin_lp_fund_brief";
```

- [ ] **Step 5: Add the new required reads**

Insert into `REQUIRED_READS`, after the existing Fund IV workflow lines:

```ts
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${UNRECORDED_WORKFLOW_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${UNRECORDED_WORKFLOW_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/workflows`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/workflows/${WORKFLOW_ID}`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/workflows/${WORKFLOW_ID}/runs`],
  ["GET", `/api/deals/${DEMO_FUND_III_ID}/runs`],
```

- [ ] **Step 6: Add the new required refusals**

Insert into `REQUIRED_REFUSALS`:

```ts
  // Listed but not recorded: the Run button must say what the workflow does.
  ["POST", `/api/deals/${DEMO_FUND_IV_ID}/workflows/${UNRECORDED_WORKFLOW_ID}/runs`],
  // Recorded, but not in this workspace: the refusal is navigation.
  ["POST", `/api/deals/${DEMO_FUND_III_ID}/workflows/${WORKFLOW_ID}/runs`],
```

- [ ] **Step 7: Make the run-start pin one per recording**

Replace the `it("still starts a run rather than refusing it", ...)` block (`coverage.test.ts:118-127`) with:

```ts
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
      endDemoRunReplay();
    }
  );
```

Add to `coverage.test.ts`'s imports:

```ts
import { DEMO_RECORDINGS } from "./fixtures/workflowRegistry";
import { endDemoRunReplay } from "./fixtures/workflows";
```

- [ ] **Step 8: Run the whole demo suite**

Run: `cd frontend && npx vitest run src/demo`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/demo/fixtures/workflowRegistry.test.ts frontend/src/demo/coverage.test.ts
git commit -m "test(demo): guard catalogue completeness and sweep the new routes"
```

---

## Task 7: Phase 1 verification and bundle measurement

**Files:** none modified unless a check fails.

- [ ] **Step 1: Full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS, zero failures. Record the total count.

- [ ] **Step 2: Typecheck and build; record the bundle**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Record the entry chunk size and the demo chunk size from Vite's output. The spec calls for measuring rather than assuming — this is the Phase 1 baseline that Phase 2's four recordings are measured against.

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Drive the demo in a browser**

Use the `frontend:verify` skill. Confirm, on Fund IV:
- the workflow list shows eight templates;
- pressing Run on DDQ Gap & Consistency Scan still animates the 12-cell grid to completion;
- pressing Run on Fund Brief shows the Brief refusal, not a red generic band.

And on Fund III:
- the workflow list shows the same eight;
- pressing Run on DDQ Gap & Consistency Scan shows the wrong-fund refusal naming Fund IV.

- [ ] **Step 5: Commit any fixes and stop for review**

Phase 1 is complete and shippable here. **Do not start Task 8 without explicit go-ahead** — every remaining task makes real Gemini API calls and writes to the dev database.

---

# Phase 2 — the four recordings

> **GATE:** Tasks 8–13 make real Gemini API calls against `backend/.env`'s `GEMINI_API_KEY` and persist runs to `backend/data/vyntic.db`. Confirm before starting, and **back up the database before each recording**.

## Task 8: Per-workflow recording config

**Files:**
- Modify: `scripts/record_demo_run.mjs`

**Interfaces:**
- Produces: a `RECORDINGS` config map keyed by workflow name, each `{ dealId, out, documents }`, where `documents` is `"all"` or an array of filenames.

- [ ] **Step 1: Replace the output map with a config map**

Replace the `OUTPUTS` object with:

```js
/**
 * Which corpus each recording reads, and where it lands.
 *
 * `documents: "all"` is the multi_doc_synthesis default — the whole fund
 * corpus, as the Run dialog offers it. Side Letter Obligations is
 * one_doc_per_row: it builds a row per document passed in, so passing all six
 * Fund III documents would yield six rows, five of them "Not found". Choosing
 * one document is what the Run dialog is for.
 */
const RECORDINGS = {
  "DDQ Gap & Consistency Scan": {
    dealId: "brightwater_iv",
    documents: "all",
    out: "frontend/src/demo/fixtures/recorded-ddq-scan-run.json",
  },
  "ODD Screen": {
    dealId: "brightwater_iv",
    documents: "all",
    out: "frontend/src/demo/fixtures/recorded-odd-screen-run.json",
  },
  "Fund Terms Extractor": {
    dealId: "brightwater_iv",
    documents: "all",
    out: "frontend/src/demo/fixtures/recorded-fund-terms-run.json",
  },
  "LPA / ILPA-Alignment Review": {
    dealId: "brightwater_iv",
    documents: "all",
    out: "frontend/src/demo/fixtures/recorded-lpa-ilpa-run.json",
  },
  "Side Letter Obligation Extractor": {
    dealId: "brightwater_iii",
    documents: ["glenmoor_fund_iii_side_letter.pdf"],
    out: "frontend/src/demo/fixtures/recorded-side-letters-run.json",
  },
};
```

- [ ] **Step 2: Read deal and documents from the config**

Replace the `const DEAL_ID = "brightwater_iv";` line and the `out` resolution with:

```js
const config = CATALOGUE_MODE ? null : RECORDINGS[workflowName];
if (!CATALOGUE_MODE && !config) {
  console.error(
    `no recording configured for "${workflowName}". Known: ${Object.keys(RECORDINGS).join(", ")}`
  );
  process.exit(1);
}
const DEAL_ID = config ? config.dealId : "brightwater_iv";
const out = CATALOGUE_MODE ? CATALOGUE_OUT : config.out;
```

Then replace the document selection (currently `document_ids: docs.map((d) => d.doc_id)`) with a filter, inserted just after the `const docs = await api(...)` line:

```js
const selected =
  config.documents === "all"
    ? docs
    : config.documents.map((filename) => {
        const doc = docs.find((d) => d.filename === filename);
        if (!doc) throw new Error(`document "${filename}" not in ${DEAL_ID}'s corpus`);
        return doc;
      });
console.log(`documents in context: ${selected.length} of ${docs.length}`);
```

and the POST body's `document_ids: selected.map((d) => d.doc_id),`.

- [ ] **Step 3: Dry-run the config resolution without recording**

```bash
node -e "process.argv=['node','x','--help']" ; node scripts/record_demo_run.mjs a b "Nope"
```
Expected: exits 1 with `no recording configured for "Nope". Known: DDQ Gap & Consistency Scan, ODD Screen, ...`

- [ ] **Step 4: Commit**

```bash
git add scripts/record_demo_run.mjs
git commit -m "chore(demo): make the recorder per-workflow"
```

---

## Tasks 9–12: Record the four runs

**These four tasks are identical in shape.** Run them one at a time, applying the honesty gate to each before moving on.

| Task | Workflow | Deal | Documents | Fixture |
|---|---|---|---|---|
| 9 | ODD Screen | `brightwater_iv` | all 7 | `recorded-odd-screen-run.json` |
| 10 | Fund Terms Extractor | `brightwater_iv` | all 7 | `recorded-fund-terms-run.json` |
| 11 | LPA / ILPA-Alignment Review | `brightwater_iv` | all 7 | `recorded-lpa-ilpa-run.json` |
| 12 | Side Letter Obligation Extractor | `brightwater_iii` | side letter only | `recorded-side-letters-run.json` |

**Hard constraint on every recording: exactly one row.** `replayDemoRun` builds its dispatch list from the workflow's *columns* (`runReplay.ts`, the `byColumn` map) and emits `workflow.columns.length` cells. A recording with two or more rows would animate one row's worth of cells and leave the rest visibly stuck at `queued` for the whole run, snapping to complete only on the terminal re-fetch — in front of a prospect. It does fail a test (`runReplay.test.ts` asserts completed events equal `run.cells.length`), but the failing test is named "plays the run it was asked for", so the message will not point at the cause.

This is why Side Letter Obligations (Task 12) is recorded against the side letter **alone**: `one_doc_per_row` builds a row per document passed in, so passing all six Fund III documents would yield six rows. If you ever widen a `one_doc_per_row` recording's document list, the replay engine needs row support first — that is a separate piece of work, not a config change.

For each:

- [ ] **Step 1: Back up the dev database**

```bash
cp backend/data/vyntic.db backend/data/vyntic.db.bak-<workflow-slug>
```

- [ ] **Step 2: Confirm the backend is up with a key**

`GEMINI_API_KEY` must be in `backend/.env` (not the repo root). Confirm the backend answers:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs
```
Expected: `200`.

- [ ] **Step 3: Record**

```bash
node scripts/record_demo_run.mjs <admin-email> <admin-password> "<Workflow Name>"
```

Expected: polls to `complete`, then `wrote frontend/src/demo/fixtures/recorded-<slug>-run.json — N cells, status complete`.

If any cell errored, the script warns. **Retry those cells in the UI and re-record** — a recording with an errored cell must not ship.

- [ ] **Step 4: Apply the honesty gate**

Read the recorded answers. Four checks, in order:

1. **Every citation resolves** to a real page of a document the demo serves. Do not eyeball this — Task 13's walker checks it against `entities.ts` page counts. Run the walker early by temporarily registering the recording (Task 13, Step 1) and running `npx vitest run src/demo/fixtures/workflowRegistry.test.ts`.
2. **No sentence asserting cross-document agreement the corpus contradicts.** Fund Terms (Task 10) is the exposed one: the fee offset is a planted 100%-versus-50% conflict between the LPA and the DDQ, and a prospect can open the DDQ and read page 7. An affirmative false consistency is worse than a missing finding — if the recording claims the offset is consistent, the recording fails the gate.
3. **Remediation is delete-only.** A weak cell is dropped, never rewritten. Deleting a sentence is condensation; adding one is invention. If deleting leaves the cell empty, the recording is thin.
4. **A recording too thin to ship moves to the refusal list instead.** ODD Screen (Task 9) has already recorded thin twice — its column prompts never ask for contradictions, and three of its eight columns are thin in this corpus. The bar it has to clear now is lower: an honest Monitor/Monitor with citations demonstrates what ODD screening looks like. But if the gate still rejects it, add its id to `UNRECORDED_REFUSALS` with copy describing the real screen, and this work ships three new workflows rather than four. **That is an accepted outcome, not a failure — report it and move on.**

- [ ] **Step 5: Commit the recording**

```bash
git add frontend/src/demo/fixtures/recorded-<slug>-run.json
git commit -m "feat(demo): record the <Workflow Name> run"
```

Or, if it failed the gate, commit the refusal instead:

```bash
git add frontend/src/demo/fixtures/workflows.ts
git commit -m "feat(demo): refuse <Workflow Name>, too thin in this corpus to record"
```

- [ ] **Step 6: Restore the database**

```bash
cp backend/data/vyntic.db.bak-<workflow-slug> backend/data/vyntic.db
```

Only if the recording added rows you do not want kept. Otherwise leave the backup in place until Phase 2 completes.

---

## Task 13: Register the recordings and re-verify

**Files:**
- Modify: `frontend/src/demo/fixtures/workflowRegistry.ts`
- Modify: `frontend/src/demo/coverage.test.ts` (the new run ids)

- [ ] **Step 1: Import and register every recording that passed the gate**

In `workflowRegistry.ts`, add the imports and extend the array. Include only the recordings that passed:

```ts
import ddqScanRun from "./recorded-ddq-scan-run.json";
import oddScreenRun from "./recorded-odd-screen-run.json";
import fundTermsRun from "./recorded-fund-terms-run.json";
import lpaIlpaRun from "./recorded-lpa-ilpa-run.json";
import sideLettersRun from "./recorded-side-letters-run.json";
```

```ts
export const DEMO_RECORDINGS: DemoRecording[] = [
  recording(ddqScanRun),
  recording(oddScreenRun),
  recording(fundTermsRun),
  recording(lpaIlpaRun),
  recording(sideLettersRun),
];
```

- [ ] **Step 2: Remove every newly-recorded workflow from the refusal table**

**This is not a no-op — it is a required edit, and the completeness guard will fail the build if you skip it.** Task 6's guard asserts each built-in is recorded **xor** refused. During Phase 1 all four Phase 2 workflows carry provisional refusals in `UNRECORDED_REFUSALS` (added in Task 6, each ending "This demo does not yet have a recorded run of it to replay"):

```
builtin_lp_fund_terms      → Fund Terms Extractor
builtin_lp_odd_screen      → ODD Screen
builtin_lp_lpa_review      → LPA / ILPA-Alignment Review
builtin_lp_side_letters    → Side Letter Obligation Extractor
```

Delete from `UNRECORDED_REFUSALS` in `workflows.ts` the entry for **every** workflow you registered a recording for in Step 1 — and only those. A workflow whose recording failed the honesty gate in Tasks 9–12 keeps its provisional refusal, but rewrite that entry's closing sentence: "does not yet have a recorded run" implies one is coming, and a workflow rejected by the gate needs wording that says what the live product does instead.

- [ ] **Step 3: Run the registry suite**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflowRegistry.test.ts`
Expected: PASS. The walkers now run over five recordings. A citation to a page beyond a document's `page_count`, or to a document belonging to the other fund, fails here — that is the honesty gate's check #1, mechanised.

- [ ] **Step 4: Add the new run ids to `coverage.test.ts`**

Read each new run id out of its fixture:

```bash
node -e "['odd-screen','fund-terms','lpa-ilpa','side-letters'].forEach(s=>{try{console.log(s, require('./frontend/src/demo/fixtures/recorded-'+s+'-run.json').id)}catch{}})"
```

Add to `REQUIRED_READS`, one pair per recording:

```ts
  ["GET", `/api/runs/<new run id>`],
  ["GET", `/api/runs/<new run id>/stream-token`],
```

The per-recording run-start pin from Task 6, Step 6 is `it.each` over `DEMO_RECORDINGS`, so it picks the new recordings up with no edit.

- [ ] **Step 5: Disarm between loop iterations, not just after the test**

Two tests loop over `DEMO_RECORDINGS` starting a run per iteration: `coverage.test.ts`'s `"still starts the %s run rather than refusing it"` and `workflows.test.ts`'s `"starts the run belonging to the workflow the visitor pressed Run on"`. Their `endDemoRunReplay()` lives in `afterEach`, which fires once per test — correct with one recording, latent fragility with five: iteration 2 arms its run while iteration 1's is still armed, and `armDemoRunReplay` overwrites unconditionally.

Add an explicit `endDemoRunReplay()` at the end of each loop body in both tests, keeping the `afterEach` as the backstop. Without this the loops still pass, but they stop proving that each run-start arms *its own* recording — which is the property the whole registry exists to protect.

- [ ] **Step 6: Full suite**

Run: `cd frontend && npm test`
Expected: PASS. In particular `runReplay.test.ts`'s `"plays the run it was asked for"` now iterates five recordings, and `"does not animate a run that was not the one armed"` is no longer vacuous.

- [ ] **Step 7: Re-measure the bundle**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Compare the entry chunk against Task 7's baseline. It should be **unchanged** — the recordings are behind the dynamic import in `lib/workflows.ts:405`. The demo chunk grows by roughly the total JSON size (the spec estimates 200–300 kB). If the *entry* chunk grew, a static import leaked the recordings into it — find it and restore the dynamic boundary.

- [ ] **Step 8: Drive the demo in a browser**

Use the `frontend:verify` skill. On Fund IV, run each of ODD Screen, Fund Terms Extractor and LPA/ILPA-Alignment Review; on Fund III, run Side Letter Obligations. Each must animate to a populated grid with working citation chips. Confirm that running one and then opening another from history does not re-animate the wrong grid.

- [ ] **Step 9: Update the spec's status and commit**

Set the spec header's `**Status:**` to `Implemented`, noting how many of the four recordings shipped.

```bash
git add frontend/src/demo/fixtures/workflowRegistry.ts frontend/src/demo/coverage.test.ts docs/superpowers/specs/2026-08-06-demo-more-lp-workflows-design.md
git commit -m "feat(demo): play the four new LP workflow recordings"
```

---

## Deviations from the spec, deliberate

- **The spec says an unknown workflow id "404s".** `transport.ts` has no 404 path — it returns `null` for unmatched routes (which the app renders as the generic "Not available in demo" band) and 403 for `DemoRefusal`. Adding a third status to the transport for a path the UI cannot reach is not worth it, so an unknown id **refuses** with a sentence instead. Strictly better for the visitor; the only reachable difference is the status code.
- **The registry lives in its own module,** not in `fixtures/workflows.ts` as the spec's "All in `fixtures/workflows.ts`" implies. `workflows.ts` is already 267 lines of routes and copy; adding the catalogue, the five recordings, the `queued` derivation and two maps would roughly double it. Routes and copy in one file, data and lookups in another — and it keeps `runReplay.ts` from importing the route table just to reach a recording.
