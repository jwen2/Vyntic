import { describe, expect, it } from "vitest";
import { tint, ACCENT } from "./theme";

describe("tint", () => {
  it("emits color-mix for hex colors", () => {
    expect(tint("#22c55e", 15)).toBe("color-mix(in srgb, #22c55e 15%, transparent)");
  });
  it("works on CSS var strings (the accent token)", () => {
    expect(tint(ACCENT, 50)).toBe("color-mix(in srgb, var(--accent) 50%, transparent)");
  });
});
