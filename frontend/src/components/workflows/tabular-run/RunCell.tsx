import { memo } from "react";
import type { Citation } from "@/lib/api";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { ACCENT, tint } from "../theme";
import CellRenderer, { proseValue, type CellDensity } from "../cells/CellRenderer";
import { formatCellValue, stripSourceMarkers } from "./format";
import { RetryIcon } from "./parts";
import { cellBodyChromeClass } from "./styles";
import Button from "@/components/ui/Button";

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
  density: CellDensity;
  onCitationClick: (citation: Citation, id: string) => void;
}) {
  const display = formatCellValue(cell, column);
  // Prose-shaped cells carry {summary, body, caveats} — their raw answer is
  // JSON, so run it through proseValue rather than dumping the blob into the
  // hover tooltip. Non-prose shapes fall back to the raw answer unchanged.
  const tooltipProse = proseValue(cell.answer_formatted, stripSourceMarkers(cell.answer || ""));
  const fullAnswer = (tooltipProse.body || tooltipProse.summary || "").trim();

  return (
    <td
      onClick={() => onSelectKey(cellKeyStr)}
      className={`group/cell ${cellBodyChromeClass} p-0 text-[11px] leading-[1.2] cursor-pointer relative align-top ${
        selected ? "" : zebra ? "bg-zebra" : "bg-surface"
      }`}
      // The selection tint is a color-mix wash over the accent, not a surface
      // token, so it (and its ring) stay inline and win over the class above.
      style={{
        background: selected ? tint(ACCENT, 12) : undefined,
        boxShadow: selected ? `inset 0 0 0 1px ${tint(ACCENT, 55)}` : undefined,
      }}
      title={fullAnswer || (Array.isArray(display) ? display.join("; ") : display)}
    >
      <CellRenderer
        cell={cell}
        column={column}
        density={density}
        onCitationClick={onCitationClick}
        citationIdPrefix={`${cell.id}_${column.id}`}
      />
      <Button
        variant="secondary"
        size="xs"
        iconOnly
        onClick={(e) => {
          e.stopPropagation();
          if (!retrying) onRetry(cell.id);
        }}
        className="opacity-0 group-hover/cell:opacity-100 transition-opacity"
        style={{ position: "absolute", top: 3, right: 3 }}
        title="Re-run this cell"
        aria-label="Retry cell"
      >
        <RetryIcon spinning={retrying} />
      </Button>
    </td>
  );
}

const ValueCell = memo(ValueCellImpl);
export default ValueCell;
