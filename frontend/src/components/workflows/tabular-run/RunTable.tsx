import { memo } from "react";
import type { Citation, DocumentMetadata } from "@/lib/api";
import type { TabularCell, WorkflowColumn, Workflow } from "@/lib/workflows";
import { getFormatShort } from "@/lib/matrixColumnConfig";
import { ACCENT, RED, VIOLET, tint } from "../theme";
import type { CellDensity } from "../cells/CellRenderer";
import { cellBodyClass, cellHeaderClass, docBodyClass, docHeaderClass } from "./styles";
import ValueCell from "./RunCell";
import ColumnEditMenu, { type ColumnDraft } from "./ColumnEditMenu";
import { cellKey } from "./useTabularRun";

interface RunTableProps {
  workflow: Workflow;
  runColumns: WorkflowColumn[];
  rowKeys: string[];
  cells: Map<string, TabularCell>;
  docs: DocumentMetadata[];
  density: CellDensity;
  COL_DOC: number;
  COL_DEFAULT: number;
  getColWidth: (key: string, fallback: number) => number;
  resizingKey: string | null;
  onColResize: (e: React.MouseEvent, key: string, startWidth: number) => void;
  selectedCellKey: string | null;
  onSelectKey: (key: string) => void;
  retryingCellIds: Set<string>;
  onRetryCell: (cellId: string) => void;
  onCitationClick: (citation: Citation, id: string) => void;
  onSaveColumn: (
    columnId: string,
    patch: ColumnDraft
  ) => Promise<{ promptChanged: boolean }>;
  onColumnPromptChanged: (columnId: string, label: string) => void;
}

export default function RunTable({
  workflow,
  runColumns,
  rowKeys,
  cells,
  docs,
  density,
  COL_DOC,
  COL_DEFAULT,
  getColWidth,
  resizingKey,
  onColResize,
  selectedCellKey,
  onSelectKey,
  retryingCellIds,
  onRetryCell,
  onCitationClick,
  onSaveColumn,
  onColumnPromptChanged,
}: RunTableProps) {
  const rowSourceIsDoc = workflow.row_source === "one_doc_per_row";

  return (
    <table
      className="bg-surface border border-edge rounded-lg"
      style={{
        width:
          getColWidth("doc", COL_DOC) +
          runColumns.reduce((sum, col) => sum + getColWidth(col.id, COL_DEFAULT), 0),
        tableLayout: "fixed",
        borderCollapse: "separate",
        borderSpacing: 0,
        fontSize: 11,
      }}
    >
      <colgroup>
        <col style={{ width: getColWidth("doc", COL_DOC) }} />
        {runColumns.map((col) => (
          <col key={col.id} style={{ width: getColWidth(col.id, COL_DEFAULT) }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className={docHeaderClass}>
            Document
            <ColResizeHandle
              active={resizingKey === "doc"}
              onMouseDown={(e) => onColResize(e, "doc", getColWidth("doc", COL_DOC))}
            />
          </th>
          {runColumns.map((col) => (
            <th key={col.id} className={`${cellHeaderClass} group/header`}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {col.label}
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: tint(VIOLET, 18),
                        color: VIOLET,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {getFormatShort(col.format)}
                    </span>
                  </div>
                  {col.prompt && col.prompt !== col.label && (
                    <div
                      className="text-t3"
                      style={{
                        fontSize: 9,
                        fontWeight: 400,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                      title={col.prompt}
                    >
                      {col.prompt}
                    </div>
                  )}
                </div>
                {!workflow.is_builtin && (
                  <ColumnEditMenu
                    column={col}
                    onSave={async (patch) => {
                      const { promptChanged } = await onSaveColumn(col.id, patch);
                      if (promptChanged) onColumnPromptChanged(col.id, patch.label);
                    }}
                  />
                )}
              </div>
              <ColResizeHandle
                active={resizingKey === col.id}
                onMouseDown={(e) => onColResize(e, col.id, getColWidth(col.id, COL_DEFAULT))}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rowKeys.map((rowKey, rowIndex) => {
          const doc = docs.find((d) => d.doc_id === rowKey);
          const rowLabel = rowSourceIsDoc ? doc?.filename ?? rowKey.slice(0, 8) : rowKey;
          const rowTitle = rowSourceIsDoc ? doc?.filename ?? rowKey : rowKey;
          const rowCells = runColumns.map((col) => cells.get(cellKey(rowKey, col.id)));
          const selectedColId =
            selectedCellKey && selectedCellKey.startsWith(`${rowKey}__`)
              ? selectedCellKey.slice(rowKey.length + 2)
              : null;
          return (
            <RunRow
              key={rowKey}
              rowKey={rowKey}
              columns={runColumns}
              rowCells={rowCells}
              rowLabel={rowLabel}
              rowTitle={rowTitle}
              zebra={rowIndex % 2 === 1}
              selectedColId={selectedColId}
              retryingCellIds={retryingCellIds}
              density={density}
              onSelectKey={onSelectKey}
              onRetryCell={onRetryCell}
              onCitationClick={onCitationClick}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// ── Row (memoized on its own cell versions) ──

interface RunRowProps {
  rowKey: string;
  columns: WorkflowColumn[];
  rowCells: (TabularCell | undefined)[];
  rowLabel: string;
  rowTitle: string;
  zebra: boolean;
  selectedColId: string | null;
  retryingCellIds: Set<string>;
  density: CellDensity;
  onSelectKey: (key: string) => void;
  onRetryCell: (cellId: string) => void;
  onCitationClick: (citation: Citation, id: string) => void;
}

function RunRowImpl({
  rowKey,
  columns,
  rowCells,
  rowLabel,
  rowTitle,
  zebra,
  selectedColId,
  retryingCellIds,
  density,
  onSelectKey,
  onRetryCell,
  onCitationClick,
}: RunRowProps) {
  return (
    <tr>
      <td className={docBodyClass(zebra)}>
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
          title={rowTitle}
        >
          {rowLabel}
        </div>
      </td>
      {columns.map((col, i) => {
        const cell = rowCells[i];
        const key = cellKey(rowKey, col.id);
        if (cell && cell.status === "complete") {
          return (
            <ValueCell
              key={col.id}
              cell={cell}
              column={col}
              cellKeyStr={key}
              selected={selectedColId === col.id}
              onSelectKey={onSelectKey}
              onRetry={onRetryCell}
              retrying={retryingCellIds.has(cell.id)}
              zebra={zebra}
              density={density}
              onCitationClick={onCitationClick}
            />
          );
        }
        return (
          <td key={col.id} className={cellBodyClass(zebra)}>
            <PlaceholderCell cell={cell} />
          </td>
        );
      })}
    </tr>
  );
}

const RunRow = memo(RunRowImpl, (prev, next) => {
  if (
    prev.rowKey !== next.rowKey ||
    prev.columns !== next.columns ||
    prev.rowLabel !== next.rowLabel ||
    prev.rowTitle !== next.rowTitle ||
    prev.zebra !== next.zebra ||
    prev.selectedColId !== next.selectedColId ||
    prev.retryingCellIds !== next.retryingCellIds ||
    prev.density !== next.density ||
    prev.onSelectKey !== next.onSelectKey ||
    prev.onRetryCell !== next.onRetryCell ||
    prev.onCitationClick !== next.onCitationClick ||
    prev.rowCells.length !== next.rowCells.length
  ) {
    return false;
  }
  for (let i = 0; i < prev.rowCells.length; i += 1) {
    if (prev.rowCells[i] !== next.rowCells[i]) return false;
  }
  return true;
});

/** Renders a placeholder for non-complete cells (queued / running / error).
 * Complete cells are delegated to CellRenderer via ValueCell. */
function PlaceholderCell({ cell }: { cell: TabularCell | undefined }) {
  if (!cell || cell.status === "queued") {
    return (
      <div
        className="bg-edge"
        style={{
          width: 30,
          height: 6,
          borderRadius: 3,
          opacity: 0.3,
        }}
      />
    );
  }
  if (cell.status === "running") {
    return (
      <div
        className="dd-pulse"
        style={{
          width: 40,
          height: 6,
          background: ACCENT,
          borderRadius: 3,
          opacity: 0.5,
        }}
      />
    );
  }
  if (cell.status === "error") {
    return (
      <span
        style={{ color: RED, fontSize: 11, fontWeight: 600 }}
        title={cell.error_message ?? "Error"}
      >
        Error
      </span>
    );
  }
  return null;
}

function ColResizeHandle({
  active,
  onMouseDown,
}: {
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      draggable={false}
      title="Drag to resize"
      className="hover:bg-blue-400/40"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        userSelect: "none",
        background: active ? "var(--accent)" : "transparent",
        transition: "background 120ms",
        zIndex: 5,
      }}
    />
  );
}
