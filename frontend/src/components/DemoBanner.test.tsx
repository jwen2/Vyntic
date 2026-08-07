import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DemoBanner from "./DemoBanner";
import { disableDemoMode, enableDemoMode, isDemoMode } from "@/demo/mode";

function renderBanner(hardNavigate = vi.fn()) {
  render(
    <MemoryRouter>
      <DemoBanner hardNavigate={hardNavigate} />
    </MemoryRouter>
  );
  return hardNavigate;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  disableDemoMode();
});

describe("DemoBanner", () => {
  it("renders nothing outside demo mode", () => {
    renderBanner();
    expect(screen.queryByRole("status")).toBeNull();
  });

  /**
   * `/demo` redirects into the real app routes, so the URL says `/app` and
   * never says "demo". This banner is the only thing on screen that tells a
   * visitor what they are looking at — and the only place the fictional-GP
   * disclosure appears.
   */
  it("labels the data as sample and the manager as fictional", () => {
    enableDemoMode();
    renderBanner();

    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/sample data/i);
    expect(banner.textContent).toMatch(/fictional/i);
    expect(banner.textContent).toMatch(/Brightwater/);
  });

  it("offers an exit control", () => {
    enableDemoMode();
    renderBanner();
    expect(screen.getByRole("button", { name: /exit demo/i })).toBeTruthy();
  });

  it("clears the flag when exited", () => {
    enableDemoMode();
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /exit demo/i }));
    expect(isDemoMode()).toBe(false);
  });

  /**
   * Leaving has to be a document navigation, matching the way `/demo` enters
   * (DemoGate:27). A client-side navigate would drop the visitor on the
   * marketing page with the demo's fixtures still registered and AuthProvider
   * still holding the demo session — a half-demo state where the flag says
   * "live" but every request is answered from a fixture. Reloading tears all
   * of it down.
   */
  it("leaves by reloading the document, not client-side", () => {
    enableDemoMode();
    const hardNavigate = renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /exit demo/i }));
    expect(hardNavigate).toHaveBeenCalledWith("/");
  });

  it("clears the flag before navigating, so the reload lands outside the demo", () => {
    enableDemoMode();
    const order: string[] = [];
    const hardNavigate = vi.fn(() => {
      order.push(isDemoMode() ? "still-demo" : "flag-cleared");
    });
    renderBanner(hardNavigate);

    fireEvent.click(screen.getByRole("button", { name: /exit demo/i }));
    expect(order).toEqual(["flag-cleared"]);
  });
});
