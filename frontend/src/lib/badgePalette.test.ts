import { describe, expect, it } from "vitest";
import { BADGE_TONES, toneVars, toneClass } from "./badgePalette";

describe("badge palette", () => {
  it("exposes exactly the 8 selectable tones in palette order", () => {
    expect(BADGE_TONES).toEqual([
      "oxblood", "clay", "ochre", "moss", "sage", "teal", "slate", "plum",
    ]);
  });

  it("resolves a tone to its three CSS vars", () => {
    expect(toneVars("sage")).toEqual({
      bg: "var(--b-sage-bg)",
      fg: "var(--b-sage-fg)",
      edge: "var(--b-sage-ed)",
    });
  });

  it("supports the reserved ink tone for terminal states", () => {
    expect(toneVars("ink")).toEqual({
      bg: "var(--b-ink-bg)",
      fg: "var(--b-ink-fg)",
      edge: "var(--b-ink-ed)",
    });
  });

  it("does not offer ink as a selectable tone", () => {
    expect(BADGE_TONES).not.toContain("ink");
  });

  it("maps a tone to its utility class", () => {
    expect(toneClass("plum")).toBe("badge-tone-plum");
  });
});
