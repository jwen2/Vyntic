import { ddTheme } from "@/components/dd/types";
import type { RunStatus, Workflow, WorkflowRun } from "@/lib/workflows";
import { ACCENT, AMBER, GREEN, RED, tint } from "../theme";
import type { Theme, WorkflowView } from "./useTabularRun";

// The run sub-header: back button, workflow/run title, status pill, view
// switcher, progress counter, and the cancel/export action.
export default function RunToolbar({
  workflow,
  run,
  theme,
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
  theme: Theme;
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
  const c = ddTheme(theme);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: `1px solid ${c.border}`,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <button
          onClick={onBack}
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: `1px solid ${c.border}`,
            borderRadius: 7,
            color: c.t2,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          ← Library
        </button>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: c.t1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {workflow.name}
            <span style={{ color: c.t3, fontWeight: 400, marginLeft: 6 }}>
              › Run #{run?.run_number ?? "…"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: c.t3, marginTop: 1 }}>
            {documentCount} doc{documentCount === 1 ? "" : "s"} ·{" "}
            {columnCount} col{columnCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <RunStatusPill status={run?.status ?? "pending"} theme={theme} />
        <ViewSwitcher value={view} onChange={onView} theme={theme} />
        <span
          style={{
            fontSize: 11,
            color: c.t2,
            fontFamily: "'DM Mono', monospace",
            whiteSpace: "nowrap",
          }}
        >
          {completeCells}/{totalCells} cells · {elapsedLabel}
        </span>
        {!isTerminal && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            style={{
              padding: "5px 10px",
              background: "transparent",
              border: `1px solid ${c.border}`,
              color: RED,
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: cancelling ? "wait" : "pointer",
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
        {isTerminal && (
          <button
            onClick={onExport}
            disabled={exporting}
            style={{
              padding: "5px 10px",
              background: ACCENT,
              border: "none",
              color: "var(--on-accent)",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: exporting ? "wait" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting ? "Exporting..." : "Excel"}
          </button>
        )}
      </div>
    </div>
  );
}

function RunStatusPill({ status, theme }: { status: RunStatus; theme: Theme }) {
  const c = ddTheme(theme);
  const map: Record<RunStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
    pending: { color: c.t2, bg: c.surfaceAlt, label: "Pending", pulse: false },
    running: { color: AMBER, bg: tint(AMBER, 15), label: "Running", pulse: true },
    // checkpoint is unreachable for tabular runs but required by RunStatus.
    checkpoint: { color: AMBER, bg: tint(AMBER, 15), label: "Checkpoint", pulse: true },
    complete: { color: GREEN, bg: tint(GREEN, 15), label: "Complete", pulse: false },
    cancelled: { color: c.t3, bg: c.surfaceAlt, label: "Cancelled", pulse: false },
    error: { color: RED, bg: tint(RED, 15), label: "Error", pulse: false },
  };
  const cfg = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        background: cfg.bg,
        color: cfg.color,
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 99,
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
  theme,
}: {
  value: WorkflowView;
  onChange: (value: WorkflowView) => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const options: Array<{ value: WorkflowView; label: string; title: string }> = [
    { value: "compact", label: "Compact", title: "Dense rows for scanning many docs" },
    { value: "comfortable", label: "Comfortable", title: "Default — summary + caveats per cell" },
    { value: "compare", label: "Compare", title: "One column, all docs side-by-side with diff" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Workflow view"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 7,
        border: `1px solid ${c.border}`,
        background: c.surfaceAlt,
      }}
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
            style={{
              border: "none",
              borderRadius: 5,
              background: active ? c.surface : "transparent",
              color: active ? c.t1 : c.t3,
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
