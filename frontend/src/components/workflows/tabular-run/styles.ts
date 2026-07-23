import type { ddTheme } from "@/components/dd/types";

// Shared table cell styles for the tabular-run grid (header + body).
export function cellHeaderStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    padding: "7px 12px 7px 9px",
    borderBottom: `1px solid ${c.border}`,
    color: c.t2,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "left",
    background: c.gridHeader,
    position: "relative",
    verticalAlign: "top",
  };
}

export function cellBodyStyle(c: ReturnType<typeof ddTheme>, zebra = false): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderBottom: `1px solid ${c.borderLight}`,
    color: c.t1,
    verticalAlign: "middle",
    height: 38,
    background: zebra ? c.zebra : c.surface,
  };
}

// The Document (first) column reads as a pinned divider: sticky-left with a
// right border and a soft depth shadow, matching the doc-matrix grid.
export function docHeaderStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    ...cellHeaderStyle(c),
    position: "sticky",
    left: 0,
    zIndex: 3,
    borderRight: `1px solid ${c.border}`,
    boxShadow: "8px 0 16px -12px rgba(0,0,0,0.22)",
  };
}

export function docBodyStyle(c: ReturnType<typeof ddTheme>, zebra = false): React.CSSProperties {
  return {
    ...cellBodyStyle(c, zebra),
    position: "sticky",
    left: 0,
    zIndex: 2,
    borderRight: `1px solid ${c.border}`,
    boxShadow: "8px 0 16px -12px rgba(0,0,0,0.18)",
  };
}
