import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SectionLabel from "./index";

afterEach(() => {
  cleanup();
});

describe("SectionLabel", () => {
  it("renders its children", () => {
    render(<SectionLabel>Run History</SectionLabel>);
    expect(screen.getByText("Run History")).toBeTruthy();
  });

  it("applies the default variant classes", () => {
    render(<SectionLabel>Stages</SectionLabel>);
    const el = screen.getByText("Stages");
    expect(el.className).toContain("text-[10px]");
    expect(el.className).toContain("font-bold");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("tracking-[0.08em]");
    expect(el.className).toContain("text-t3");
  });

  it("applies the mono variant classes instead of the default ones", () => {
    render(<SectionLabel variant="mono">Queue</SectionLabel>);
    const el = screen.getByText("Queue");
    expect(el.className).toContain("font-mono-plex");
    expect(el.className).toContain("tracking-[0.14em]");
    expect(el.className).not.toContain("font-bold");
    expect(el.className).not.toContain("tracking-[0.08em]");
  });

  it("carries no margin of its own so callers own their spacing", () => {
    render(<SectionLabel>Sources</SectionLabel>);
    expect(screen.getByText("Sources").className).not.toMatch(/\bmb-/);
  });

  it("appends caller className without dropping variant classes", () => {
    render(<SectionLabel className="mb-2">Columns</SectionLabel>);
    const el = screen.getByText("Columns");
    expect(el.className).toContain("mb-2");
    expect(el.className).toContain("text-t3");
  });

  it("forwards arbitrary div props", () => {
    render(<SectionLabel id="sec-1">Flow</SectionLabel>);
    expect(screen.getByText("Flow").id).toBe("sec-1");
  });
});
