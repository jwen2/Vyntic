import type { RunStatus, Workflow, WorkflowRun } from "@/lib/workflows";
import { AMBER, GREEN, RED, tint } from "../theme";
import type { WorkflowView } from "./useTabularRun";
import Button from "@/components/ui/Button";

// The run sub-header: back button, workflow/run title, status pill, view
// switcher, progress counter, and the cancel/export action.
export default function RunToolbar({
  workflow,
  run,
  view,
  onView,
  documentCount,
  columnCount,
  completeCells,
  totalCells,
  elapsedLabel,
  isTerminal,
  cancelling,
  exporting,
  onBack,
  onCancel,
  onExport,
}: {
  workflow: Workflow;
  run: WorkflowRun | null;
  view: WorkflowView;
  onView: (view: WorkflowView) => void;
  documentCount: number;
  columnCount: number;
  completeCells: number;
  totalCells: number;
  elapsedLabel: string;
  isTerminal: boolean;
  cancelling: boolean;
  exporting: boolean;
  onBack: () => void;
  onCancel: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-b-edge">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <Button variant="subtle" size="sm" onClick={onBack}>
          ← Library
        </Button>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div className="text-[13px] font-semibold text-t1 whitespace-nowrap overflow-hidden text-ellipsis">
            {workflow.name}
            <span className="text-t3 font-normal ml-1.5">
              › Run #{run?.run_number ?? "…"}
            </span>
          </div>
          <div className="text-[11px] text-t3 mt-px">
            {documentCount} doc{documentCount === 1 ? "" : "s"} ·{" "}
            {columnCount} col{columnCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <RunStatusPill status={run?.status ?? "pending"} />
        <ViewSwitcher value={view} onChange={onView} />
        <span
          className="text-[11px] text-t2 whitespace-nowrap"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {completeCells}/{totalCells} cells · {elapsedLabel}
        </span>
        {!isTerminal && (
          <Button
            variant="danger"
            size="sm"
            loading={cancelling}
            onClick={onCancel}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {isTerminal && (
          <Button
            variant="primary"
            size="sm"
            loading={exporting}
            onClick={onExport}
          >
            {exporting ? "Exporting..." : "Excel"}
          </Button>
        )}
      </div>
    </div>
  );
}

function RunStatusPill({ status }: { status: RunStatus }) {
  // The pill's colors are data, not markup: four of the six statuses are status
  // hues (AMBER/GREEN/RED washes) with no Tailwind token, so the two neutral
  // rows reference the CSS vars directly rather than splitting this map into a
  // class path and a style path.
  const map: Record<RunStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
    pending: { color: "var(--text-2)", bg: "var(--surface-alt)", label: "Pending", pulse: false },
    running: { color: AMBER, bg: tint(AMBER, 15), label: "Running", pulse: true },
    // checkpoint is unreachable for tabular runs but required by RunStatus.
    checkpoint: { color: AMBER, bg: tint(AMBER, 15), label: "Checkpoint", pulse: true },
    complete: { color: GREEN, bg: tint(GREEN, 15), label: "Complete", pulse: false },
    cancelled: {
      color: "var(--text-3)",
      bg: "var(--surface-alt)",
      label: "Cancelled",
      pulse: false,
    },
    error: { color: RED, bg: tint(RED, 15), label: "Error", pulse: false },
  };
  const cfg = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        background: cfg.bg,
        color: cfg.color,
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 7,
      }}
    >
      <span
        className={cfg.pulse ? "dd-pulse" : undefined}
        style={{ width: 6, height: 6, background: cfg.color, borderRadius: "50%" }}
      />
      {cfg.label}
    </span>
  );
}

function ViewSwitcher({
  value,
  onChange,
}: {
  value: WorkflowView;
  onChange: (value: WorkflowView) => void;
}) {
  const options: Array<{ value: WorkflowView; label: string; title: string }> = [
    { value: "compact", label: "Compact", title: "Dense rows for scanning many docs" },
    { value: "comfortable", label: "Comfortable", title: "Default — summary + caveats per cell" },
    { value: "compare", label: "Compare", title: "One column, all docs side-by-side with diff" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Workflow view"
      className="flex items-center gap-0.5 p-0.5 rounded-[7px] border border-edge bg-surface-alt"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`border-none rounded-[5px] px-2 py-[3px] text-[10px] font-bold cursor-pointer ${
              active ? "bg-surface text-t1" : "bg-transparent text-t3"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
