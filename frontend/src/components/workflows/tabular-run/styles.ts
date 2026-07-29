// Shared table cell classes for the tabular-run grid (header + body).
//
// All cell chrome (padding, colors, borders, sticky "Document" column
// geometry) comes from the shared interactive-grid layer at
// ../../ui/grid-table.css — see task-1-report.md in
// .superpowers/sdd/2026-07-27-interactive-grid-chrome/ for the full class
// list. This file just picks the right combination of those classes.
//
// `cellBodyChromeClass` maps to `.grid-table__td--chrome`, a standalone
// chrome-only variant (border-bottom, color, height, vertical-align — no
// padding, no background) rather than `.grid-table__td`: `RunCell.tsx`'s
// value cells override padding to 0 and background (selection tint) in the
// same class string as this constant. `grid-table.css` is imported after
// Tailwind's generated utilities in main.tsx, so `.grid-table__td`'s
// baked-in padding/background would beat those same-string Tailwind
// overrides by stylesheet order, not lose to them — composing onto the
// bundled class there would silently break the overrides rather than
// compose with them. See `.grid-table__td--chrome`'s comment in
// grid-table.css for the full reasoning.
export const cellBodyChromeClass = "grid-table__td--chrome";

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
