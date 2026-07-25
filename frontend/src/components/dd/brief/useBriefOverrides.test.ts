import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useBriefOverrides } from "./useBriefOverrides";
import { OVERRIDE_KEY_PREFIX } from "./config";

vi.mock("@/lib/api", () => ({
  getBriefOverrides: vi.fn(),
  putBriefOverrides: vi.fn(),
}));

const api = await import("@/lib/api");
const getBriefOverrides = vi.mocked(api.getBriefOverrides);
const putBriefOverrides = vi.mocked(api.putBriefOverrides);

const KEY = OVERRIDE_KEY_PREFIX + "deal1";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  putBriefOverrides.mockResolvedValue(undefined as never);
});
afterEach(() => {
  localStorage.clear();
});

/**
 * FE5.3 — these cover the server I/O the parser tests deliberately don't
 * reach: the server-first load, the one-time localStorage migration, and the
 * best-effort persistence on edit.
 */
describe("useBriefOverrides — loading", () => {
  it("uses the server's overrides when it returns any", async () => {
    getBriefOverrides.mockResolvedValue({ snapshot: { Sector: "Software" } } as never);
    localStorage.setItem(KEY, JSON.stringify({ snapshot: { Sector: "STALE" } }));

    const { result } = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(result.current.overrides).toEqual({ snapshot: { Sector: "Software" } }));

    // Server wins outright — no migration, and the local copy is left alone.
    expect(putBriefOverrides).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("migrates localStorage up exactly once when the server is empty", async () => {
    getBriefOverrides.mockResolvedValue({} as never);
    const local = { snapshot: { Sector: "Healthcare" } };
    localStorage.setItem(KEY, JSON.stringify(local));

    const { result } = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(result.current.overrides).toEqual(local));
    await waitFor(() => expect(putBriefOverrides).toHaveBeenCalledWith("deal1", local));

    // The local key is cleared only after a successful PUT, so the migration
    // cannot run twice.
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it("keeps the local copy when the migration PUT fails", async () => {
    getBriefOverrides.mockResolvedValue({} as never);
    putBriefOverrides.mockRejectedValue(new Error("offline"));
    const local = { snapshot: { Sector: "Healthcare" } };
    localStorage.setItem(KEY, JSON.stringify(local));

    const { result } = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(result.current.overrides).toEqual(local));
    await waitFor(() => expect(putBriefOverrides).toHaveBeenCalled());

    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("falls back to localStorage when the server request fails", async () => {
    getBriefOverrides.mockRejectedValue(new Error("500"));
    localStorage.setItem(KEY, JSON.stringify({ snapshot: { Sector: "Local" } }));

    const { result } = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(result.current.overrides).toEqual({ snapshot: { Sector: "Local" } }));
    expect(putBriefOverrides).not.toHaveBeenCalled();
  });

  it("tolerates unparseable localStorage", async () => {
    getBriefOverrides.mockRejectedValue(new Error("500"));
    localStorage.setItem(KEY, "{not json");

    const { result } = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(result.current.overrides).toEqual({}));
  });

  it("ends with empty overrides when neither source has any", async () => {
    getBriefOverrides.mockResolvedValue({} as never);
    const { result } = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(getBriefOverrides).toHaveBeenCalled());
    expect(result.current.overrides).toEqual({});
    expect(putBriefOverrides).not.toHaveBeenCalled();
  });

  it("reloads when the deal changes", async () => {
    getBriefOverrides.mockResolvedValue({} as never);
    const { rerender } = renderHook(({ id }) => useBriefOverrides(id), {
      initialProps: { id: "deal1" },
    });
    await waitFor(() => expect(getBriefOverrides).toHaveBeenCalledWith("deal1"));
    rerender({ id: "deal2" });
    await waitFor(() => expect(getBriefOverrides).toHaveBeenCalledWith("deal2"));
  });
});

describe("useBriefOverrides — setOverride", () => {
  const mount = async () => {
    getBriefOverrides.mockResolvedValue({} as never);
    const hook = renderHook(() => useBriefOverrides("deal1"));
    await waitFor(() => expect(getBriefOverrides).toHaveBeenCalled());
    return hook;
  };

  it("adds a value and persists the whole store", async () => {
    const { result } = await mount();
    act(() => result.current.setOverride("snapshot", "Sector", "Software"));

    expect(result.current.overrides).toEqual({ snapshot: { Sector: "Software" } });
    expect(putBriefOverrides).toHaveBeenCalledWith("deal1", { snapshot: { Sector: "Software" } });
  });

  it("trims whitespace around the value", async () => {
    const { result } = await mount();
    act(() => result.current.setOverride("snapshot", "Sector", "  Software  "));
    expect(result.current.overrides.snapshot.Sector).toBe("Software");
  });

  it("clears a field on empty/whitespace/null and drops the panel when it empties", async () => {
    const { result } = await mount();
    act(() => result.current.setOverride("snapshot", "Sector", "Software"));
    act(() => result.current.setOverride("snapshot", "Sector", "   "));

    // The now-empty panel key is removed rather than left as {}.
    expect(result.current.overrides).toEqual({});

    act(() => result.current.setOverride("snapshot", "Sector", "Software"));
    act(() => result.current.setOverride("snapshot", "Sector", null));
    expect(result.current.overrides).toEqual({});
  });

  it("keeps sibling fields and other panels intact", async () => {
    const { result } = await mount();
    act(() => result.current.setOverride("snapshot", "Sector", "Software"));
    act(() => result.current.setOverride("snapshot", "Geography", "EU"));
    act(() => result.current.setOverride("transaction", "Ownership", "80%"));
    act(() => result.current.setOverride("snapshot", "Sector", null));

    expect(result.current.overrides).toEqual({
      snapshot: { Geography: "EU" },
      transaction: { Ownership: "80%" },
    });
  });

  it("swallows a failed PUT so the analyst's edit still lands in the UI", async () => {
    const { result } = await mount();
    putBriefOverrides.mockRejectedValue(new Error("offline"));

    act(() => result.current.setOverride("snapshot", "Sector", "Software"));
    expect(result.current.overrides).toEqual({ snapshot: { Sector: "Software" } });
  });
});
