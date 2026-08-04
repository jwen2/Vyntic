import type { RunStreamEvent, TabularCell } from "@/lib/workflows";
import {
  DEMO_DDQ_RUN,
  DEMO_DDQ_RUN_QUEUED,
  DEMO_DDQ_WORKFLOW,
  armDemoRunReplay,
  consumeDemoRunReplayArm,
  endDemoRunReplay,
} from "./fixtures/workflows";

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
 * Replays the recorded DDQ Gap & Consistency Scan as a live-looking stream.
 *
 * The schedule is not invented: every event fires at its real offset from
 * `run.started_at`, so the replay takes the 6.75 s the run actually took and
 * reproduces the executor's concurrency of 4 for free — four cells start
 * together, and each of the remaining eight starts as an earlier one finishes.
 * That overlap is why completions arrive out of column order, and it is the
 * part that makes the animation read as genuine rather than as a progress bar.
 *
 * Only a run the visitor just started animates. Opening the same run from
 * history emits one snapshot of the finished recording, because that is what
 * the real product does.
 *
 * Returns a cleanup function with the same contract as `subscribeRun`.
 */
export function replayDemoRun(onEvent: (event: RunStreamEvent) => void): () => void {
  const armed = consumeDemoRunReplayArm();
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
    if (!finished) armDemoRunReplay();
  };

  if (!armed) {
    schedule(0, () => onEvent({ type: "snapshot", run: DEMO_DDQ_RUN }));
    return cleanup;
  }

  // Every workflow column must have a recorded cell. Skipping a column that
  // does not would animate an 11-cell grid with no error anywhere — a demo that
  // quietly shows less than it promises. A drifted re-recording should stop the
  // replay dead so it is caught in development, not in front of a prospect.
  const byColumn = new Map(DEMO_DDQ_RUN.cells.map((cell) => [cell.column_id, cell]));
  const dispatched = DEMO_DDQ_WORKFLOW.columns.map((column): TabularCell => {
    const cell = byColumn.get(column.id);
    if (!cell) {
      throw new Error(
        `Demo replay: the recorded run has no cell for workflow column ` +
          `"${column.label}" (${column.id}). The recording and DEMO_DDQ_WORKFLOW ` +
          `have drifted apart — re-record the run or fix the column list.`
      );
    }
    return cell;
  });

  const base = Date.parse(DEMO_DDQ_RUN.started_at);
  schedule(0, () => onEvent({ type: "snapshot", run: DEMO_DDQ_RUN_QUEUED }));

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
    offsetMs(DEMO_DDQ_RUN.completed_at, base, lastAt + FALLBACK_STEP_MS),
    lastAt
  );
  schedule(runDoneAt, () => {
    // Disarm before the terminal event: it makes `useTabularRun` re-fetch the
    // canonical run, which must now resolve to the completed recording.
    finished = true;
    endDemoRunReplay();
    onEvent({ type: "run", run_id: DEMO_DDQ_RUN.id, status: "complete" });
  });

  return cleanup;
}
