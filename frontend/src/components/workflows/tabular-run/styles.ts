// Shared table cell classes for the tabular-run grid (header + body).
//
// Class strings rather than CSSProperties (DS2): colors come from the semantic
// Tailwind aliases (`text-t1`, `bg-zebra`, `border-b-edge`), so the grid
// re-themes off the `.dark` class instead of through an inline style object.
//
// The base constants deliberately omit `position` and, for the body, padding
// and background: the sticky Document column and the value cell compose onto
// them, and two competing utilities in one class string resolve by stylesheet
// order, not string order (there is no tailwind-merge in this project).

const HEADER_BASE =
  "pt-[7px] pr-3 pb-[7px] pl-[9px] border-b border-b-edge bg-grid-header " +
  "font-mono-dm text-t3 text-[11px] font-normal text-left align-top";

/**
 * Body-cell chrome minus padding/background, for cells that paint their own —
 * `RunCell` overrides both to host a selection tint and an absolutely
 * positioned retry button.
 */
export const cellBodyChromeClass = "border-b border-b-edge-light text-t1 h-[38px]";

const BODY_BASE = `${cellBodyChromeClass} px-[10px] py-2 align-middle`;

// The Document (first) column reads as a pinned divider: sticky-left with a
// right border and a soft depth shadow, matching the doc-matrix grid.
const DOC_PIN = "sticky left-0 border-r border-r-edge";

export const cellHeaderClass = `${HEADER_BASE} relative`;

export const docHeaderClass = `${HEADER_BASE} ${DOC_PIN} z-[3] shadow-[8px_0_16px_-12px_rgba(0,0,0,0.22)]`;

export function cellBodyClass(zebra = false): string {
  return `${BODY_BASE} ${zebra ? "bg-zebra" : "bg-surface"}`;
}

export function docBodyClass(zebra = false): string {
  return `${cellBodyClass(zebra)} ${DOC_PIN} z-[2] shadow-[8px_0_16px_-12px_rgba(0,0,0,0.18)]`;
}
