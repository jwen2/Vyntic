/**
 * Sector-tag tone assignments for the deal list (components/home/DealListItem.tsx).
 * DealListItem's analogue of STAGE_TONES (stageBadges.ts) — same curated badge
 * palette (badgePalette.ts), same theme-aware CSS vars, no separate light/dark
 * map to keep in sync. Kept in its own module (rather than defined inline in
 * DealListItem.tsx) so it can be imported by both the component and its test
 * without tripping react-refresh's "only export components" rule.
 *
 * Hue picked per sector to stay close to its pre-reskin assignment (the
 * retired SECTOR_STYLES/DARK_SECTOR_STYLES hex maps this replaced). Each of
 * the 8 tones is used exactly once, so no two sector chips ever read
 * identically.
 *
 * NOT guaranteed: distinctness from stage chips (stageBadges.ts STAGE_TONES)
 * — the palette has only 8 tones and stages already claim 5 of them, so a
 * sector tag can render the same tone as a stage chip in the same row (e.g.
 * Technology sector = Due Diligence stage, both slate). Differentiation
 * relies on the text label in that case, same as this palette's accepted
 * stance on moss/sage/teal sharing luminance.
 *
 * Checked separately: oxblood (Healthcare) against --accent-tint (the
 * selected-row wash, #f2e5e1) — chip-bg-vs-wash is ~1.09:1 and
 * chip-border-vs-wash is ~1.8:1, both under the palette's general 2.2:1
 * border target. Not a distinct regression: a plain slate chip against a
 * plain white surface measures almost the same (~1.1:1) — every chip in this
 * palette relies on its label (>6.6:1 in all cases, oxblood included) rather
 * than its fill for legibility against a differently-toned surface, by
 * design. This resolves the plan's open question on oxblood vs --soft.
 */
import type { BadgeTone } from "./badgePalette";

export const SECTOR_TONES: Record<string, BadgeTone> = {
  Technology: "slate",
  Healthcare: "oxblood",
  Industrials: "teal",
  Consumer: "plum",
  "Financial Services": "sage",
  Energy: "ochre",
  "Real Estate": "clay",
  Infrastructure: "moss",
};
