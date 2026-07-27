import { describe, expect, it } from "vitest";
import { tint, ACCENT, AMBER, GREEN, RED } from "./theme";

describe("tint", () => {
  it("emits color-mix for hex colors", () => {
    expect(tint("#22c55e", 15)).toBe("color-mix(in srgb, #22c55e 15%, transparent)");
  });
  it("works on CSS var strings (the accent token)", () => {
    expect(tint(ACCENT, 50)).toBe("color-mix(in srgb, var(--accent) 50%, transparent)");
  });
});

describe("semantic colour exports", () => {
  it("routes every semantic colour through a token, not a hex literal", () => {
    for (const [name, value] of Object.entries({ AMBER, GREEN, RED })) {
      expect(value, `${name} must be a CSS var`).toMatch(/^var\(--[a-z-]+\)$/);
    }
  });

  it("maps amber and green onto the shared status scale", () => {
    expect(AMBER).toBe("var(--status-warning)");
    expect(GREEN).toBe("var(--status-good)");
  });

  it("still composes with tint()", () => {
    expect(tint(GREEN, 15)).toBe("color-mix(in srgb, var(--status-good) 15%, transparent)");
  });
});
