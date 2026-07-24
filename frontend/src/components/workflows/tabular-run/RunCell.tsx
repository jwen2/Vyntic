import { memo } from "react";
import { ddTheme } from "@/components/dd/types";
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { ACCENT, tint } from "../theme";
import CellRenderer, { proseValue, type CellDensity } from "../cells/CellRenderer";
import { formatCellValue, stripSourceMarkers } from "./format";
import { RetryIcon } from "./parts";
import { cellBodyStyle } from "./styles";
import type { Theme } from "./useTabularRun";

// A completed-cell <td>. Memoized so a single SSE cell update re-renders one
// cell, not the whole grid — all handler props are stable refs from the hook,
// so shallow comparison holds while `cell`/`selected`/`retrying` drive updates.
function ValueCellImpl({
  cell,
  column,
  cellKeyStr,
  selected,
  onSelectKey,
  onRetry,
  retrying,
  zebra,
  theme,
  density,
  onCitationClick,
}: {
  cell: TabularCell;
  column: WorkflowColumn;
  cellKeyStr: string;
  selected: boolean;
  onSelectKey: (key: string) => void;
  onRetry: (cellId: string) => void;
  retrying: boolean;
  zebra: boolean;
  theme: Theme;
  density: CellDensity;
  onCitationClick: (citation: Citation, id: string) => void;
}) {
  const c = ddTheme(theme);
  const display = formatCellValue(cell, column);
  // Prose-shaped cells carry {summary, body, caveats} — their raw answer is
  // JSON, so run it through proseValue rather than dumping the blob into the
  // hover tooltip. Non-prose shapes fall back to the raw answer unchanged.
  const tooltipProse = proseValue(cell.answer_formatted, stripSourceMarkers(cell.answer || ""));
  const fullAnswer = (tooltipProse.body || tooltipProse.summary || "").trim();

  return (
    <td
      onClick={() => onSelectKey(cellKeyStr)}
      className="group/cell"
      style={{
        ...cellBodyStyle(c, zebra),
        padding: 0,
        fontSize: 11,
        lineHeight: 1.2,
        cursor: "pointer",
        position: "relative",
        verticalAlign: "top",
        background: selected ? tint(ACCENT, 12) : zebra ? c.zebra : c.surface,
        boxShadow: selected ? `inset 0 0 0 1px ${tint(ACCENT, 55)}` : undefined,
      }}
      title={fullAnswer || (Array.isArray(display) ? display.join("; ") : display)}
    >
      <CellRenderer
        cell={cell}
        column={column}
        theme={theme}
        density={density}
        onCitationClick={onCitationClick}
        citationIdPrefix={`${cell.id}_${column.id}`}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!retrying) onRetry(cell.id);
        }}
        className="opacity-0 group-hover/cell:opacity-100 transition-opacity"
        style={{
          position: "absolute",
          top: 3,
          right: 3,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: retrying ? c.t3 : c.t2,
          cursor: retrying ? "wait" : "pointer",
          padding: 0,
        }}
        title="Re-run this cell"
        aria-label="Retry cell"
      >
        <RetryIcon spinning={retrying} />
      </button>
    </td>
  );
}

const ValueCell = memo(ValueCellImpl);
export default ValueCell;
