import { describe, expect, it } from "vitest";
import { TAG_COLORS, CURRENCY_COLORS } from "./matrixColumnConfig";
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
