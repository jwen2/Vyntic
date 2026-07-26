import { describe, expect, it } from "vitest";
import { TAG_COLORS, CURRENCY_COLORS, getPillClass } from "./matrixColumnConfig";
import { BADGE_TONES } from "./badgePalette";

const LEGAL = new Set(BADGE_TONES.map((t) => `badge-tone-${t}`));

describe("matrix chip colours", () => {
  it("uses palette classes, never raw Tailwind colour utilities", () => {
    for (const cls of [...TAG_COLORS, ...Object.values(CURRENCY_COLORS)]) {
      expect(cls, `"${cls}" is not a palette class`).toMatch(/^badge-tone-[a-z]+$/);
      expect(LEGAL.has(cls), `"${cls}" is not a known tone`).toBe(true);
    }
  });

  it("keeps tag colours distinct so adjacent tags stay separable", () => {
    expect(new Set(TAG_COLORS).size).toBe(TAG_COLORS.length);
  });

  it("still covers every currency it covered before", () => {
    for (const code of ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CNY"]) {
      expect(CURRENCY_COLORS[code]).toBeDefined();
    }
  });
});

describe("getPillClass", () => {
  it("returns palette classes for yes/no", () => {
    expect(getPillClass("Yes", { format: "yes_no" })).toBe("badge-tone-moss");
    expect(getPillClass("No", { format: "yes_no" })).toBe("badge-tone-oxblood");
  });

  it("falls back to badge-tone-ink for an unrecognized currency", () => {
    expect(getPillClass("XYZ", { format: "currency" })).toBe("badge-tone-ink");
  });

  it("falls back to badge-tone-ink for unformatted content", () => {
    expect(getPillClass("anything")).toBe("badge-tone-ink");
  });

  it("never returns a raw Tailwind colour utility", () => {
    const cases = [
      getPillClass("Yes", { format: "yes_no" }),
      getPillClass("USD", { format: "currency" }),
      getPillClass("XYZ", { format: "currency" }),
      getPillClass("anything"),
    ];
    for (const cls of cases) {
      expect(cls).toMatch(/^badge-tone-[a-z]+$/);
    }
  });
});
