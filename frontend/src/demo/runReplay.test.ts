import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { replayDemoRun } from "./runReplay";
import { resetDemoRoutes, demoFetch } from "@/demo/transport";
import {
  registerWorkflowFixtures,
  DEMO_DDQ_RUN,
  DEMO_DDQ_WORKFLOW,
  armDemoRunReplay,
  endDemoRunReplay,
} from "./fixtures/workflows";
import { DEMO_FLAG_KEY } from "./mode";
import { subscribeRun, type RunStreamEvent, type TabularCell } from "@/lib/workflows";

const RUN_START_MS = Date.parse(DEMO_DDQ_RUN.started_at);
/** The recorded run's real wall clock: 6.75 s, not an invented 20-30 s. */
const RUN_WALL_MS = Date.parse(DEMO_DDQ_RUN.completed_at!) - RUN_START_MS;

function collect(): { events: RunStreamEvent[]; stop: () => void } {
  const events: RunStreamEvent[] = [];
  const stop = replayDemoRun((e) => events.push(e));
  return { events, stop };
}

function cellEvents(events: RunStreamEvent[], status: TabularCell["status"]): TabularCell[] {
  return events
    .filter((e): e is Extract<RunStreamEvent, { type: "cell" }> => e.type === "cell")
    .map((e) => e.cell)
    .filter((c) => c.status === status);
}

describe("replayDemoRun", () => {
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

  describe("armed — a run the visitor just started", () => {
    beforeEach(() => armDemoRunReplay());

    it("opens with a snapshot of a running run whose 12 cells are all queued", () => {
      const { events } = collect();
      vi.advanceTimersByTime(0);

      expect(events).toHaveLength(1);
      const first = events[0];
      expect(first.type).toBe("snapshot");
      if (first.type !== "snapshot") throw new Error("unreachable");
      expect(first.run.status).toBe("running");
      expect(first.run.completed_at).toBeNull();
      expect(first.run.cells).toHaveLength(12);
      for (const cell of first.run.cells) {
        expect(cell.status).toBe("queued");
        expect(cell.answer).toBe("");
        expect(cell.answer_display).toBe("");
        expect(cell.answer_formatted).toBeNull();
        expect(cell.citations).toEqual([]);
        expect(cell.started_at).toBeNull();
        expect(cell.completed_at).toBeNull();
      }
    });

    it("emits a running event and then a complete event for every cell", () => {
      const { events } = collect();
      vi.advanceTimersByTime(120_000);

      expect(cellEvents(events, "running")).toHaveLength(12);
      expect(cellEvents(events, "complete")).toHaveLength(12);

      const last = events[events.length - 1];
      expect(last.type).toBe("run");
      if (last.type !== "run") throw new Error("unreachable");
      expect(last.run_id).toBe(DEMO_DDQ_RUN.id);
      expect(last.status).toBe("complete");
    });

    it("dispatches cells in exact workflow column order", () => {
      const { events } = collect();
      vi.advanceTimersByTime(120_000);

      expect(cellEvents(events, "running").map((c) => c.column_id)).toEqual(
        DEMO_DDQ_WORKFLOW.columns.map((c) => c.id)
      );
    });

    it("completes cells in the order the real run finished them, not column order", () => {
      const { events } = collect();
      vi.advanceTimersByTime(120_000);

      // Concurrency 4 means completions interleave: Valuation Policy (column 6)
      // really did finish before Fund Terms & Economics (column 5). Replaying
      // the recorded finishing order is the point — column-ordered completions
      // would be the invented version.
      const byFinish = [...DEMO_DDQ_RUN.cells].sort(
        (a, b) => Date.parse(a.completed_at!) - Date.parse(b.completed_at!)
      );
      expect(cellEvents(events, "complete").map((c) => c.column_id)).toEqual(
        byFinish.map((c) => c.column_id)
      );
      expect(cellEvents(events, "complete").map((c) => c.column_id)).not.toEqual(
        DEMO_DDQ_WORKFLOW.columns.map((c) => c.id)
      );
    });

    it("runs an in-flight cell with nothing filled in yet", () => {
      const { events } = collect();
      vi.advanceTimersByTime(120_000);

      for (const cell of cellEvents(events, "running")) {
        const recorded = DEMO_DDQ_RUN.cells.find((c) => c.id === cell.id);
        expect(recorded).toBeDefined();
        expect(cell.answer).toBe("");
        expect(cell.answer_display).toBe("");
        expect(cell.answer_formatted).toBeNull();
        expect(cell.citations).toEqual([]);
        expect(cell.completed_at).toBeNull();
        // The real started_at, so the grid's elapsed timer is honest.
        expect(cell.started_at).toBe(recorded!.started_at);
      }
    });

    it("hands back the recorded cell verbatim on completion", () => {
      const { events } = collect();
      vi.advanceTimersByTime(120_000);

      const completed = cellEvents(events, "complete");
      for (const cell of completed) {
        const recorded = DEMO_DDQ_RUN.cells.find((c) => c.id === cell.id);
        // Identity, not deep equality: the demo must not paraphrase a recording.
        expect(cell).toBe(recorded);
      }
    });

    it("replays the recorded 6.75s wall clock, not an invented 20-30s", () => {
      const { events } = collect();

      const lastCellDone = Math.max(
        ...DEMO_DDQ_RUN.cells.map((c) => Date.parse(c.completed_at!) - RUN_START_MS)
      );
      vi.advanceTimersByTime(lastCellDone - 1);
      expect(cellEvents(events, "complete").length).toBeLessThan(12);

      vi.advanceTimersByTime(1);
      expect(cellEvents(events, "complete")).toHaveLength(12);
      // The terminal run event trails the last cell by the recorded margin.
      expect(events[events.length - 1].type).toBe("cell");

      vi.advanceTimersByTime(RUN_WALL_MS - lastCellDone);
      expect(events[events.length - 1].type).toBe("run");

      vi.advanceTimersByTime(120_000);
      // Nothing trails the recorded completion.
      expect(events.length).toBe(1 + 12 + 12 + 1);
      expect(RUN_WALL_MS).toBeLessThan(10_000);
    });

    it("keeps four cells in flight at once, matching the executor's concurrency", () => {
      const { events } = collect();
      const offset = (iso: string | null) => Date.parse(iso!) - RUN_START_MS;
      const inFlight = () =>
        cellEvents(events, "running").length - cellEvents(events, "complete").length;

      // Cells 1-4 start within 200 ms of each other and nothing else moves
      // until one of them lands.
      const firstDone = offset(DEMO_DDQ_RUN.cells[0].completed_at);
      vi.advanceTimersByTime(firstDone - 1);
      expect(cellEvents(events, "running")).toHaveLength(4);
      expect(cellEvents(events, "complete")).toHaveLength(0);
      expect(inFlight()).toBe(4);

      // The fifth is admitted only once a slot frees up.
      vi.advanceTimersByTime(1);
      expect(cellEvents(events, "complete")).toHaveLength(1);
      vi.advanceTimersByTime(offset(DEMO_DDQ_RUN.cells[4].started_at) - firstDone);
      expect(cellEvents(events, "running")).toHaveLength(5);
      expect(inFlight()).toBe(4);
    });

    it("fires every event at its recorded offset from the run start", () => {
      const { events } = collect();
      const offset = (iso: string | null) => Date.parse(iso!) - RUN_START_MS;

      // The whole schedule, derived from the recording rather than restated.
      const expected: { at: number; label: string }[] = [{ at: 0, label: "snapshot" }];
      for (const cell of DEMO_DDQ_RUN.cells) {
        expected.push({ at: offset(cell.started_at), label: `running ${cell.column_id}` });
        expected.push({ at: offset(cell.completed_at), label: `complete ${cell.column_id}` });
      }
      expected.push({ at: offset(DEMO_DDQ_RUN.completed_at), label: "run complete" });
      expected.sort((a, b) => a.at - b.at);

      let now = 0;
      let started = false;
      expected.forEach((step, index) => {
        if (!started || step.at > now) {
          if (step.at > now) {
            // Stop one tick short: nothing scheduled later may have fired yet.
            vi.advanceTimersByTime(step.at - now - 1);
            expect(events.length, `${step.label} fired early`).toBe(index);
            vi.advanceTimersByTime(1);
          } else {
            vi.advanceTimersByTime(0);
          }
          now = step.at;
          started = true;
        }
        expect(events.length, `${step.label} did not fire at ${step.at}ms`).toBeGreaterThan(
          index
        );
      });
      expect(events).toHaveLength(expected.length);
    });

    it("stops emitting after the returned cleanup runs", () => {
      const { events, stop } = collect();
      vi.advanceTimersByTime(0);
      const afterSnapshot = events.length;
      expect(afterSnapshot).toBe(1);

      stop();
      vi.advanceTimersByTime(120_000);
      expect(events.length).toBe(afterSnapshot);
    });

    it("consumes the arming, so a second subscribe does not re-animate", () => {
      const first = collect();
      vi.advanceTimersByTime(120_000);
      expect(cellEvents(first.events, "complete")).toHaveLength(12);

      const second = collect();
      vi.advanceTimersByTime(120_000);
      expect(second.events).toHaveLength(1);
      expect(second.events[0].type).toBe("snapshot");
    });
  });

  describe("not armed — browsing a run that already finished", () => {
    it("emits one snapshot of the completed run and nothing else", () => {
      const { events } = collect();
      vi.advanceTimersByTime(120_000);

      expect(events).toHaveLength(1);
      const only = events[0];
      expect(only.type).toBe("snapshot");
      if (only.type !== "snapshot") throw new Error("unreachable");
      expect(only.run).toBe(DEMO_DDQ_RUN);
      expect(only.run.status).toBe("complete");
      expect(only.run.cells).toHaveLength(12);
      expect(only.run.cells.every((c) => c.status === "complete")).toBe(true);
    });
  });

  describe("the run-start route", () => {
    it("arms the replay, so starting a run animates while history does not", async () => {
      const idle = await (await demoFetch(`/api/runs/${DEMO_DDQ_RUN.id}`, {
        method: "GET",
      })!).json();
      expect(idle.status).toBe("complete");

      const started = await (await demoFetch(
        `/api/deals/${DEMO_DDQ_RUN.deal_id}/workflows/${DEMO_DDQ_WORKFLOW.id}/runs`,
        { method: "POST", body: JSON.stringify({ document_ids: [], synthesis_questions: [] }) }
      )!).json();
      expect(started.id).toBe(DEMO_DDQ_RUN.id);
      expect(started.status).toBe("running");

      // useTabularRun re-fetches the run on mount; while armed that fetch must
      // not hand back the finished answers the replay is about to stream in.
      const onMount = await (await demoFetch(`/api/runs/${DEMO_DDQ_RUN.id}`, {
        method: "GET",
      })!).json();
      expect(onMount.status).toBe("running");
      expect(onMount.cells.every((c: TabularCell) => c.status === "queued")).toBe(true);

      const { events } = collect();
      vi.advanceTimersByTime(120_000);
      expect(cellEvents(events, "complete")).toHaveLength(12);

      // Once the replay is done the canonical fetch is the finished run again.
      const afterRun = await (await demoFetch(`/api/runs/${DEMO_DDQ_RUN.id}`, {
        method: "GET",
      })!).json();
      expect(afterRun.status).toBe("complete");
    });

    it("mints a stream token over GET, the method subscribeRun actually uses", async () => {
      const res = demoFetch(`/api/runs/${DEMO_DDQ_RUN.id}/stream-token`, { method: "GET" });
      expect(res).not.toBeNull();
      expect(await (await res!).json()).toEqual({ token: "demo-stream-token" });
    });
  });
});

describe("subscribeRun demo guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDemoRoutes();
    registerWorkflowFixtures();
    endDemoRunReplay();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    endDemoRunReplay();
    sessionStorage.clear();
  });

  it("replays without touching the network when the demo flag is on", async () => {
    sessionStorage.setItem(DEMO_FLAG_KEY, "1");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const events: RunStreamEvent[] = [];
    const stop = subscribeRun(DEMO_DDQ_RUN.id, (e) => events.push(e));
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("snapshot");
    stop();
  });

  it("takes the real EventSource path and emits nothing when the flag is off", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("backend unreachable"));
    vi.stubGlobal("fetch", fetchSpy);

    const events: RunStreamEvent[] = [];
    const errors: Event[] = [];
    const stop = subscribeRun(
      DEMO_DDQ_RUN.id,
      (e) => events.push(e),
      (err) => errors.push(err)
    );
    await vi.advanceTimersByTimeAsync(120_000);

    // Production path: it went to the network for a stream token and never
    // consulted a fixture.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      `/runs/${DEMO_DDQ_RUN.id}/stream-token`
    );
    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
    stop();
  });
});
