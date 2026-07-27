import { describe, expect, it } from "vitest";
import { SECTOR_TONES } from "./sectorTones";
import { BADGE_TONES } from "./badgePalette";

// SECTOR_TONES is DealListItem's analogue of stageBadges.ts's STAGE_TONES —
// same "only assigns tones that exist in the palette" guard as
// stageBadges.test.ts, so a typo'd tone name fails loudly instead of quietly
// falling back to the neutral chip everywhere at once.
describe("SECTOR_TONES", () => {
  it("only assigns tones that exist in the palette", () => {
    const legal = new Set<string>(BADGE_TONES);
    for (const [sector, tone] of Object.entries(SECTOR_TONES)) {
      expect(legal.has(tone), `${sector} uses unknown tone ${tone}`).toBe(true);
    }
  });

  it("uses each of the 8 tones exactly once, so no two sector chips read identically", () => {
    const tones = Object.values(SECTOR_TONES);
    expect(new Set(tones).size).toBe(tones.length);
  });
});
