/**
 * Curated badge palette (spec D1). Eight admin-selectable tones plus a
 * reserved `ink` used for terminal states.
 *
 * Colour lives in CSS vars (index.css), never here — that is what keeps the
 * palette theme-aware by construction and keeps the off-palette scanner's
 * whitelist finite. Every value was derived and contrast-verified: worst
 * label contrast 7.01:1, worst border 2.2:1, across both themes.
 *
 * Note: moss, sage and teal share luminance and separate by hue alone. That
 * is acceptable only because a badge always carries a text label, making
 * colour a redundant channel. Do not use these tones as a sole signal.
 */
export type BadgeTone =
  | "oxblood"
  | "clay"
  | "ochre"
  | "moss"
  | "sage"
  | "teal"
  | "slate"
  | "plum";

/** Not admin-selectable — reserved for terminal stages (Closed, Committed). */
export type ReservedTone = "ink";

export const BADGE_TONES: readonly BadgeTone[] = [
  "oxblood",
  "clay",
  "ochre",
  "moss",
  "sage",
  "teal",
  "slate",
  "plum",
] as const;

export interface ToneVars {
  bg: string;
  fg: string;
  edge: string;
}

/** CSS var triple for inline `style={{}}` consumers. */
export function toneVars(tone: BadgeTone | ReservedTone): ToneVars {
  return {
    bg: `var(--b-${tone}-bg)`,
    fg: `var(--b-${tone}-fg)`,
    edge: `var(--b-${tone}-ed)`,
  };
}

/** Utility class for `className` consumers (see .badge-tone-* in index.css). */
export function toneClass(tone: BadgeTone | ReservedTone): string {
  return `badge-tone-${tone}`;
}
