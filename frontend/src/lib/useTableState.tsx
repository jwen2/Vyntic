import { Children, isValidElement, ReactNode, useRef } from "react";

/**
 * Render-time enforcement for ReactMarkdown tables. Counts header columns,
 * then for each body row either passes it through, splits a k*N row into k
 * rows, truncates an oversized row to N, or pads a short row to N. This
 * stops malformed LLM tables from bleeding outwards visually.
 *
 * Usage in a ReactMarkdown components map:
 *   const ts = useTableState();
 *   table: ({ children }) => { ts.reset(); return <table>{children}</table>; }
 *   th:    ({ children }) => { ts.recordHeaderCol(); return <th>{children}</th>; }
 *   tr:    ({ children }) => {
 *     const rows = ts.processRow(children);
 *     if (rows === null) return <tr>{children}</tr>;     // header row
 *     return <>{rows.map((c, i) => <tr key={i}>{c}</tr>)}</>;
 *   }
 */
export function useTableState() {
  const ref = useRef({ cols: 0, isHeaderRow: true });

  return {
    reset() {
      ref.current = { cols: 0, isHeaderRow: true };
    },
    recordHeaderCol() {
      ref.current.cols += 1;
    },
    /**
     * Returns null for the header row (caller passes through), or an array
     * of cell arrays for body rows. One inner array = one <tr> the caller
     * should emit.
     */
    processRow(children: ReactNode): ReactNode[][] | null {
      if (ref.current.isHeaderRow) {
        ref.current.isHeaderRow = false;
        return null;
      }
      const cols = ref.current.cols;
      const arr = Children.toArray(children).filter(isValidElement);
      if (cols === 0 || arr.length === cols) return [arr];
      if (arr.length > cols && arr.length % cols === 0) {
        const rows: ReactNode[][] = [];
        for (let i = 0; i < arr.length; i += cols) {
          rows.push(arr.slice(i, i + cols));
        }
        return rows;
      }
      if (arr.length > cols) return [arr.slice(0, cols)];
      const padded = [...arr];
      while (padded.length < cols) {
        padded.push(<td key={`pad-${padded.length}`} />);
      }
      return [padded];
    },
  };
}
