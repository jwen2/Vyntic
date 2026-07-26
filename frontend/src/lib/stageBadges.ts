/**
 * Deal/fund stage badge styling, shared by the home deal list, the deal
 * workspace top bar and the manager page so a stage reads the same everywhere.
 *
 * Colour comes from the curated badge palette (lib/badgePalette.ts), which is
 * theme-aware via CSS vars — hence no `isDark` parameter. Contrast is verified
 * once at the palette level: worst label 7.01:1, worst border 2.2:1.
 *
 * Defaults below preserve the pre-reskin hue assignments where a palette tone
 * is close, so nothing shifts unrecognisably. When admin-configurable badge
 * colour ships, this map becomes the fallback for stages with no stored tone.
 */
import type { BadgeTone, ReservedTone } from "./badgePalette";
import { toneVars } from "./badgePalette";

export interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
}

export const STAGE_TONES: Record<string, BadgeTone | ReservedTone> = {
  // Deal track
  Screening: "sage",
  "Due Diligence": "slate",
  "IC Review": "plum",
  Closed: "ink",
  // Fund lifecycle
  Diligence: "slate",
  IC: "plum",
  Committed: "ink",
  Monitoring: "moss",
  "Re-up review": "ochre",
};

/** Badge style for a stage, or null if unrecognized (caller supplies a neutral fallback). */
export function stageBadge(stage: string): BadgeStyle | null {
  const tone = STAGE_TONES[stage];
  if (!tone) return null;
  const v = toneVars(tone);
  return { bg: v.bg, fg: v.fg, border: v.edge };
}
