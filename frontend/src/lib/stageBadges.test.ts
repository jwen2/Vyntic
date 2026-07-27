import { describe, expect, it } from "vitest";
import { stageBadge, STAGE_TONES } from "./stageBadges";
import { BADGE_TONES } from "./badgePalette";

describe("stageBadge", () => {
  it("returns CSS vars, not hex, so the chip is theme-aware", () => {
    const badge = stageBadge("Screening");
    expect(badge).toEqual({
      bg: "var(--b-sage-bg)",
      fg: "var(--b-sage-fg)",
      border: "var(--b-sage-ed)",
    });
  });

  it("inverts terminal stages to ink", () => {
    for (const terminal of ["Closed", "Committed"]) {
      expect(stageBadge(terminal)).toEqual({
        bg: "var(--b-ink-bg)",
        fg: "var(--b-ink-fg)",
        border: "var(--b-ink-ed)",
      });
    }
  });

  it("gives the deal and fund tracks matching tones for equivalent stages", () => {
    expect(stageBadge("Due Diligence")).toEqual(stageBadge("Diligence"));
    expect(stageBadge("IC Review")).toEqual(stageBadge("IC"));
  });

  it("returns null for an unknown stage so callers can fall back", () => {
    expect(stageBadge("Not A Stage")).toBeNull();
  });

  it("only assigns tones that exist in the palette", () => {
    const legal = new Set<string>([...BADGE_TONES, "ink"]);
    for (const [stage, tone] of Object.entries(STAGE_TONES)) {
      expect(legal.has(tone), `${stage} uses unknown tone ${tone}`).toBe(true);
    }
  });
});
