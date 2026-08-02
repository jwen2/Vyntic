import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";

// vite.config.ts sets globals:false, so testing-library's automatic cleanup
// never registers — without this, renders accumulate and queries find
// multiple matches.
afterEach(cleanup);

// jsdom has no matchMedia; LandingScrollReveal calls it on mount to honour
// prefers-reduced-motion. Report "no preference" so the normal path runs.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  // Same story for IntersectionObserver, which the reveal wrapper constructs
  // once matchMedia reports no motion preference.
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof window.IntersectionObserver;
});

describe("LandingPage", () => {
  it("scopes the Ivory palette to the whole page via the shell class", () => {
    // The class carries every --landing-* token. It sits on the shell rather
    // than :root because LoginPage and the workspace still consume the :root
    // values, so a page that loses it silently falls back to the old palette.
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const shell = container.firstElementChild;
    expect(shell?.classList.contains("landing-ivory")).toBe(true);
    expect(shell?.classList.contains("landing-shell")).toBe(true);
  });
});
