import type { RunStreamEvent, TabularCell } from "@/lib/workflows";
import {
  armDemoRunReplay,
  consumeDemoRunReplayArm,
  endDemoRunReplay,
} from "./fixtures/workflows";
import { RECORDING_BY_RUN } from "./fixtures/workflowRegistry";

/**
 * Used only if the recording's timestamps stop making sense — a re-recording
 * with a missing or non-monotonic clock. A steady 300 ms beat is worse than
 * the real thing but still animates, which beats throwing inside a stream
 * subscription in front of a prospect.
 */
const FALLBACK_STEP_MS = 300;

/** Milliseconds from the run's start, or `fallback` if the stamp is unusable. */
function offsetMs(iso: string | null, base: number, fallback: number): number {
  if (!iso) return fallback;
  const delta = Date.parse(iso) - base;
  return Number.isFinite(delta) && delta >= 0 ? delta : fallback;
}

/**
 * A cell as the executor publishes it the moment it marks it running
 * (workflow_run_executor.py:278) — claimed, timed, and empty.
 *
 * `quality` and `duration_ms` describe a finished answer, so they are cleared
 * here rather than carried over from the recording: the run log prints a cell's
 * duration when it completes, and showing the final figure on a cell that has
 * not completed would be a small lie in an animation whose whole value is that
 * it is not one.
 */
function asRunning(cell: TabularCell): TabularCell {
  return {
    ...cell,
    status: "running",
    answer: "",
    answer_display: "",
    answer_formatted: null,
    citations: [],
    quality: null,
    duration_ms: 0,
    completed_at: null,
  };
}

/**
 * Replays a recorded run as a live-looking stream.
 *
 * The schedule is not invented: every event fires at its real offset from
 * `run.started_at`, so the replay takes the wall clock the run actually took
 * and reproduces the executor's concurrency for free — cells start together,
 * and each later one starts as an earlier one finishes. That overlap is why
 * completions arrive out of column order, and it is the part that makes the
 * animation read as genuine rather than as a progress bar.
 *
 * Only a run the visitor just started animates. Opening the same run from
 * history emits one snapshot of the finished recording, because that is what
 * the real product does.
 *
 * Returns a cleanup function with the same contract as `subscribeRun`.
 */
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

  const schedule = (at: number, fn: () => void): void => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) fn();
      }, at)
    );
  };

  const cleanup = (): void => {
    cancelled = true;
    for (const timer of timers) clearTimeout(timer);
    if (!armed) return;
    // A teardown part-way through is routine, not a cancellation: the stream
    // effect in `useTabularRun` lists `docs` in its deps and `docs` resolves
    // asynchronously after mount, so React tears this subscription down and
    // immediately builds another one. Disarming here would hand that next
    // subscription nothing to animate — a grid of 12 finished answers that
    // never moved, which looks correct and is therefore the worst way to fail.
    // Handing the arm back instead makes the resubscription pick the replay up
    // from the top. Once the terminal event has fired the run has legitimately
    // completed and already disarmed; re-arming then would re-animate a run
    // opened from history, so `finished` gates it.
    //
    // This unconditional re-arm assumes run B's start can never land while run
    // A's subscription is still tearing down — if it did, this would hand A's
    // arm back over B's, and B would open as a static grid of finished answers
    // with no error anywhere, the worst way to fail described above. That
    // assumption holds today only because the run-start handler is reachable
    // solely from the workflow library screen, which unmounts the run view
    // (and with it, this subscription) before a new run can be started. A
    // future "Run again" affordance placed on the run screen itself, letting a
    // visitor start run B without leaving run A's view, would break this
    // ordering and reintroduce the hazard.
    if (!finished) armDemoRunReplay(runId);
  };

  if (!armed) {
    schedule(0, () => onEvent({ type: "snapshot", run }));
    return cleanup;
  }

  // Every workflow column must have a recorded cell. Skipping a column that
  // does not would animate an 11-cell grid with no error anywhere — a demo that
  // quietly shows less than it promises. A drifted re-recording should stop the
  // replay dead so it is caught in development, not in front of a prospect.
  const byColumn = new Map(run.cells.map((cell) => [cell.column_id, cell]));
  const dispatched = workflow.columns.map((column): TabularCell => {
    const cell = byColumn.get(column.id);
    if (!cell) {
      throw new Error(
        `Demo replay: the recorded run for "${workflow.name}" has no cell for ` +
          `workflow column "${column.label}" (${column.id}). The recording and ` +
          `the catalogue have drifted apart — re-record the run.`
      );
    }
    return cell;
  });

  const base = Date.parse(run.started_at);
  schedule(0, () => onEvent({ type: "snapshot", run: queued }));

  let lastAt = 0;
  dispatched.forEach((cell, index) => {
    const startAt = offsetMs(cell.started_at, base, (index + 1) * FALLBACK_STEP_MS);
    const doneAt = offsetMs(cell.completed_at, base, startAt + FALLBACK_STEP_MS);
    const running = asRunning(cell);
    schedule(startAt, () => onEvent({ type: "cell", cell: running }));
    schedule(doneAt, () => onEvent({ type: "cell", cell }));
    lastAt = Math.max(lastAt, doneAt);
  });

  const runDoneAt = Math.max(
    offsetMs(run.completed_at, base, lastAt + FALLBACK_STEP_MS),
    lastAt
  );
  schedule(runDoneAt, () => {
    // Disarm before the terminal event: it makes `useTabularRun` re-fetch the
    // canonical run, which must now resolve to the completed recording.
    finished = true;
    endDemoRunReplay();
    onEvent({ type: "run", run_id: run.id, status: "complete" });
  });

  return cleanup;
}
