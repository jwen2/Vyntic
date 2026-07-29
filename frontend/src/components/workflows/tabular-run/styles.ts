// Shared table cell classes for the tabular-run grid (header + body).
//
// Header and non-value body-cell chrome (padding, colors, borders, sticky
// "Document" column geometry) comes from the shared interactive-grid layer at
// ../../ui/grid-table.css — see task-1-report.md in
// .superpowers/sdd/2026-07-27-interactive-grid-chrome/ for the full class
// list. This file just picks the right combination of those classes.
//
// `cellBodyChromeClass` deliberately stays a standalone Tailwind subset
// rather than consuming `.grid-table__td`: `RunCell.tsx`'s value cells
// override padding to 0, vertical-align to top, and background (selection
// tint) in the same class string as this constant. `grid-table.css` is
// imported after Tailwind's generated utilities in main.tsx, so
// `.grid-table__td`'s baked-in padding/vertical-align/background would beat
// those same-string Tailwind overrides by stylesheet order, not lose to
// them — composing onto the bundled class there would silently break the
// overrides rather than compose with them.

/**
 * Body-cell chrome minus padding/background/vertical-align, for cells that
 * paint their own — `RunCell` overrides all three to host a selection tint
 * and an absolutely positioned retry button. See file header for why this
 * doesn't consume `.grid-table__td` directly.
 */
export const cellBodyChromeClass = "border-b border-b-edge-light text-t1 h-[38px]";

export const cellHeaderClass = "grid-table__th";

// The Document (first) column reads as a pinned divider: sticky-left with a
// right border and a soft depth shadow, matching the doc-matrix grid.
export const docHeaderClass = "grid-table__th grid-table__th--pinned";

export function cellBodyClass(zebra = false): string {
  return `grid-table__td${zebra ? " grid-table__td--zebra" : ""}`;
}

export function docBodyClass(zebra = false): string {
  return `${cellBodyClass(zebra)} grid-table__td--pinned`;
}
