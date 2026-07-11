import type { ddTheme } from "@/components/dd/types";

// Shared table cell styles for the tabular-run grid (header + body).
export function cellHeaderStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    padding: "7px 12px 7px 9px",
    borderBottom: `1px solid ${c.border}`,
    borderRight: `1px solid ${c.border}`,
    color: c.t2,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "left",
    background: c.surfaceAlt,
    position: "relative",
    verticalAlign: "top",
  };
}

export function cellBodyStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderBottom: `1px solid ${c.border}`,
    borderRight: `1px solid ${c.border}`,
    color: c.t1,
    verticalAlign: "middle",
    height: 38,
    background: c.surface,
  };
}
