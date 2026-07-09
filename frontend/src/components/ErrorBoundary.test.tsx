import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("boom from tab");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors; keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>healthy content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("healthy content")).toBeTruthy();
  });

  it("contains a crash: fallback shows, siblings outside the boundary survive", () => {
    render(
      <div>
        <span>topbar alive</span>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText("topbar alive")).toBeTruthy();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("boom from tab")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText("custom fallback")).toBeTruthy();
  });
});
