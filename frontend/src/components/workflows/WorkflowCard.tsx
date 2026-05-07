"use client";

import { ddTheme } from "@/components/dd/types";
import type { Workflow } from "@/lib/workflows";
import { tint, workflowTypeColor, workflowTypeIcon, workflowTypeLabel } from "./theme";

type Theme = "light" | "dark";

interface WorkflowCardProps {
  workflow: Workflow;
  theme: Theme;
  onClone?: () => void;
  onEdit?: () => void;
  /** Open the doc-selector to start a run. Tabular workflows only in Phase 2. */
  onRun?: () => void;
  onHistory?: () => void;
  onDelete?: () => void;
}

export default function WorkflowCard({
  workflow,
  theme,
  onClone,
  onEdit,
  onRun,
  onHistory,
  onDelete,
}: WorkflowCardProps) {
  // Run is live when an onRun handler is wired up.
  const runDisabled = !onRun;
  const c = ddTheme(theme);
  const typeColor = workflowTypeColor(workflow.type);
  const typeLabel = workflowTypeLabel(
    workflow.type,
    workflow.stages.length,
    workflow.columns.length
  );

  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: tint(typeColor, 20),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            {workflowTypeIcon(workflow.type)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.t1 }}>{workflow.name}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 7px",
                  borderRadius: 4,
                  color: typeColor,
                  background: tint(typeColor, 15),
                }}
              >
                {typeLabel}
              </span>
              {workflow.is_builtin && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 4,
                    color: c.t3,
                    background: c.surfaceAlt,
                    border: `1px solid ${c.border}`,
                  }}
                >
                  Built-in
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {workflow.description && (
        <p style={{ fontSize: 12, color: c.t2, lineHeight: 1.5, margin: 0 }}>
          {workflow.description}
        </p>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: "auto", flexWrap: "wrap" }}>
        <CardButton
          label="Run"
          primary
          disabled={runDisabled}
          onClick={onRun}
          theme={theme}
        />
        {workflow.is_builtin ? (
          <CardButton label="Edit Copy" onClick={onClone} theme={theme} />
        ) : (
          <CardButton label="Edit" onClick={onEdit} theme={theme} />
        )}
        {onHistory && <CardButton label="History" onClick={onHistory} theme={theme} />}
        {onDelete && !workflow.is_builtin && (
          <CardButton label="Delete" onClick={onDelete} theme={theme} danger />
        )}
      </div>
    </div>
  );
}

interface CardButtonProps {
  label: string;
  onClick?: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  theme: Theme;
}

function CardButton({ label, onClick, primary, danger, disabled, theme }: CardButtonProps) {
  const c = ddTheme(theme);
  const bg = disabled
    ? c.surfaceAlt
    : primary
      ? "#2563eb"
      : danger
        ? "transparent"
        : c.surfaceAlt;
  const fg = disabled
    ? c.t3
    : primary
      ? "white"
      : danger
        ? "#ef4444"
        : c.t1;
  const border = primary ? "transparent" : `1px solid ${c.border}`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px",
        background: bg,
        color: fg,
        border,
        borderRadius: 7,
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
