import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useBriefDiff, type UseBriefDiffArgs } from "./useBriefDiff";
import { BRIEF_CONFIG, DIFF_KEY_PREFIX, type QuestionResult } from "./config";

const KEY = DIFF_KEY_PREFIX + "deal1";
const brief = BRIEF_CONFIG.deal;

const workstream = {
  id: "proactive_scan" as const,
  templates: [
    { label: brief.snapshotLabel, query: "q-snap" },
    { label: brief.transactionLabel, query: "q-txn" },
  ],
};

const cell = (pairs: Array<{ key: string; value: string }>): QuestionResult => ({
  answer: "",
  formatted: { kind: "kv", pairs },
  citations: [],
  status: "complete",
});

const baseArgs = (over: Partial<UseBriefDiffArgs> = {}): UseBriefDiffArgs => ({
  dealId: "deal1",
  brief,
  scanWorkstream: workstream,
  scanResults: {},
  overrides: {},
  snapshotFields: [],
  transactionFields: [],
  lastScanAt: null,
  refreshing: false,
  hasAnyCompleted: false,
  isLoading: false,
  kickOffRun: vi.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useBriefDiff — persistence", () => {
  it("loads a stored snapshot on mount", async () => {
    const stored = { changes: [], at: 123, previousAt: 100 };
    localStorage.setItem(KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useBriefDiff(baseArgs()));
    await waitFor(() => expect(result.current.diff).toEqual(stored));
    // A restored snapshot never auto-opens the panel.
    expect(result.current.diffOpen).toBe(false);
  });

  it("tolerates unparseable stored JSON", async () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useBriefDiff(baseArgs()));
    await waitFor(() => expect(result.current.diff).toBeNull());
  });

  it("clears state and storage on dismiss", async () => {
    localStorage.setItem(KEY, JSON.stringify({ changes: [], at: 1 }));
    const { result } = renderHook(() => useBriefDiff(baseArgs()));
    await waitFor(() => expect(result.current.diff).not.toBeNull());

    act(() => result.current.dismissDiff());

    expect(result.current.diff).toBeNull();
    expect(result.current.diffOpen).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("reloads when the deal changes", async () => {
    localStorage.setItem(DIFF_KEY_PREFIX + "deal2", JSON.stringify({ changes: [], at: 9 }));
    const { result, rerender } = renderHook((args: UseBriefDiffArgs) => useBriefDiff(args), {
      initialProps: baseArgs(),
    });
    await waitFor(() => expect(result.current.diff).toBeNull());

    rerender(baseArgs({ dealId: "deal2" }));
    await waitFor(() => expect(result.current.diff).toEqual({ changes: [], at: 9 }));
  });
});

describe("useBriefDiff — re-run", () => {
  it("does nothing while a run is already refreshing", () => {
    const kickOffRun = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBriefDiff(baseArgs({ refreshing: true, kickOffRun })));

    act(() => result.current.handleRerun());
    expect(kickOffRun).not.toHaveBeenCalled();
  });

  it("does nothing without a workstream", () => {
    const kickOffRun = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBriefDiff(baseArgs({ scanWorkstream: null, kickOffRun }))
    );

    act(() => result.current.handleRerun());
    expect(kickOffRun).not.toHaveBeenCalled();
  });

  it("kicks off the run and reports rerunning until it settles", async () => {
    let resolveRun: () => void = () => {};
    const kickOffRun = vi.fn(() => new Promise<void>((r) => { resolveRun = r; }));
    const { result } = renderHook(() => useBriefDiff(baseArgs({ kickOffRun })));

    act(() => result.current.handleRerun());
    expect(kickOffRun).toHaveBeenCalledTimes(1);
    expect(result.current.rerunning).toBe(true);

    await act(async () => { resolveRun(); });
    await waitFor(() => expect(result.current.rerunning).toBe(false));
  });

  it("diffs the new scan against the pre-run snapshot and opens the panel", async () => {
    const kickOffRun = vi.fn().mockResolvedValue(undefined);
    const before = baseArgs({
      kickOffRun,
      snapshotFields: [{ label: "Sector", value: "Software" }],
      lastScanAt: 1000,
    });
    const { result, rerender } = renderHook((args: UseBriefDiffArgs) => useBriefDiff(args), {
      initialProps: before,
    });

    // Snapshot the "before" side, then let the run settle.
    await act(async () => { result.current.handleRerun(); });
    await waitFor(() => expect(result.current.rerunning).toBe(false));

    // New cells arrive complete — this is what triggers the diff effect.
    rerender(
      baseArgs({
        kickOffRun,
        snapshotFields: [{ label: "Sector", value: "Healthcare" }],
        scanResults: { "q-snap": cell([{ key: "Sector", value: "Healthcare" }]) },
        hasAnyCompleted: true,
        isLoading: false,
      })
    );

    await waitFor(() => expect(result.current.diff).not.toBeNull());
    expect(result.current.diff!.changes).toEqual([
      {
        panel: "snapshot",
        panelLabel: brief.snapshotLabel,
        label: "Sector",
        before: "Software",
        after: "Healthcare",
        kind: "changed",
      },
    ]);
    // Carries the prior scan time forward, opens the panel, and persists.
    expect(result.current.diff!.previousAt).toBe(1000);
    expect(result.current.diffOpen).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!).changes).toHaveLength(1);
  });

  it("waits for cells to finish before diffing", async () => {
    const kickOffRun = vi.fn().mockResolvedValue(undefined);
    const args = baseArgs({ kickOffRun, snapshotFields: [{ label: "Sector", value: "Software" }] });
    const { result, rerender } = renderHook((a: UseBriefDiffArgs) => useBriefDiff(a), {
      initialProps: args,
    });

    await act(async () => { result.current.handleRerun(); });
    await waitFor(() => expect(result.current.rerunning).toBe(false));

    // Still streaming — no diff yet.
    rerender(baseArgs({ kickOffRun, hasAnyCompleted: true, isLoading: true }));
    expect(result.current.diff).toBeNull();
  });

  it("records a no-change re-run as an empty diff without opening the panel", async () => {
    const kickOffRun = vi.fn().mockResolvedValue(undefined);
    const fields = [{ label: "Sector", value: "Software" }];
    const { result, rerender } = renderHook((a: UseBriefDiffArgs) => useBriefDiff(a), {
      initialProps: baseArgs({ kickOffRun, snapshotFields: fields }),
    });

    await act(async () => { result.current.handleRerun(); });
    await waitFor(() => expect(result.current.rerunning).toBe(false));

    rerender(
      baseArgs({
        kickOffRun,
        snapshotFields: fields,
        scanResults: { "q-snap": cell([{ key: "Sector", value: "Software" }]) },
        hasAnyCompleted: true,
      })
    );

    await waitFor(() => expect(result.current.diff).not.toBeNull());
    expect(result.current.diff!.changes).toEqual([]);
    expect(result.current.diffOpen).toBe(false);
  });

  it("does not diff when no re-run was started", async () => {
    const { result, rerender } = renderHook((a: UseBriefDiffArgs) => useBriefDiff(a), {
      initialProps: baseArgs(),
    });
    rerender(
      baseArgs({
        scanResults: { "q-snap": cell([{ key: "Sector", value: "Healthcare" }]) },
        hasAnyCompleted: true,
      })
    );
    expect(result.current.diff).toBeNull();
  });
});
