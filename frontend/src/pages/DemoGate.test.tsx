import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import DemoGate from "./DemoGate";
import { enableDemoMode } from "@/demo/mode";
import { registerAllDemoFixtures } from "@/demo";

vi.mock("@/demo/mode", () => ({ enableDemoMode: vi.fn() }));
vi.mock("@/demo", () => ({ registerAllDemoFixtures: vi.fn() }));

/** Reports the router's current path so a test can tell a client-side
 *  route change apart from "the gate left the routing to the browser". */
function LocationProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderGate(hardNavigate: (url: string) => void) {
  render(
    <MemoryRouter initialEntries={["/demo"]}>
      <Routes>
        <Route path="/demo" element={<DemoGate hardNavigate={hardNavigate} />} />
        <Route path="/app" element={<p>workspace</p>} />
        <Route path="/" element={<p>marketing</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

function path() {
  return screen.getByTestId("path").textContent;
}

beforeEach(() => {
  vi.mocked(registerAllDemoFixtures).mockClear();
  vi.mocked(enableDemoMode).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DemoGate", () => {
  it("registers fixtures before flipping the flag", async () => {
    vi.mocked(enableDemoMode).mockReturnValue(true);
    const hardNavigate = vi.fn();

    renderGate(hardNavigate);

    await waitFor(() => expect(enableDemoMode).toHaveBeenCalled());
    expect(registerAllDemoFixtures).toHaveBeenCalled();
    expect(vi.mocked(registerAllDemoFixtures).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(enableDemoMode).mock.invocationCallOrder[0]
    );
  });

  it("enters the demo with a hard navigation to /app, not a client-side route change", async () => {
    // Regression: a client-side navigate() leaves AuthProvider mounted with
    // the bootstrap it already ran before the demo flag existed — user stays
    // null, so ProtectedRoute bounces a first-time visitor to /login. Only a
    // full document load re-runs main.tsx's fixture registration and lets
    // AuthProvider bootstrap off DEMO_TOKEN.
    vi.mocked(enableDemoMode).mockReturnValue(true);
    const hardNavigate = vi.fn();

    renderGate(hardNavigate);

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/app"));
    expect(hardNavigate).toHaveBeenCalledTimes(1);
    // The router must not have moved on its own — that would mean the app
    // stayed booted and the auth bootstrap never re-ran.
    expect(path()).toBe("/demo");
    expect(screen.queryByText("workspace")).toBeNull();
  });

  it("falls back to a client-side navigate home when the flag could not be set", async () => {
    // No flag was written, so a document reload would buy nothing and would
    // only cost the visitor a blank round trip.
    vi.mocked(enableDemoMode).mockReturnValue(false);
    const hardNavigate = vi.fn();

    renderGate(hardNavigate);

    await waitFor(() => expect(path()).toBe("/"));
    expect(screen.getByText("marketing")).toBeTruthy();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  // The default seam (window.location.replace) is deliberately not unit
  // tested: jsdom implements no navigation and refuses to let a spy redefine
  // location.replace ("Cannot redefine property"). Its behaviour is verified
  // in a real browser instead.
});
