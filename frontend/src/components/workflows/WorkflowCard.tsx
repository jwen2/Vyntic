import { ddTheme } from "@/components/dd/types";
import type { Workflow } from "@/lib/workflows";
import { ACCENT, VIOLET, formatRelativeShort, tint, workflowTypeColor } from "./theme";

type Theme = "light" | "dark";

interface WorkflowCardProps {
  workflow: Workflow;
  theme: Theme;
  onClone?: () => void;
  onEdit?: () => void;
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
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const typeColor = workflowTypeColor(workflow.type);
  const primaryAction = workflow.is_builtin
    ? { label: "Clone to edit", onClick: onClone }
    : { label: "Open editor", onClick: onEdit };
  const runLabel = workflow.type === "assistant" ? "Run memo" : "Run extraction";

  const meta = [
    {
      label: workflow.type === "assistant" ? "Stages" : "Columns",
      value: String(workflow.type === "assistant" ? workflow.stages.length : workflow.columns.length),
    },
    {
      label: "Scope",
      value: workflow.row_source === "multi_doc_synthesis" ? "Multi-doc" : "One-doc",
    },
    {
      label: "Updated",
      value: formatRelativeShort(workflow.updated_at),
    },
  ];

  return (
    <article
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 24,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 272,
        boxShadow: isDark ? "0 16px 30px rgba(0,0,0,0.18)" : "0 16px 30px rgba(17,17,17,0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3" style={{ minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: workflow.type === "assistant" ? ACCENT : VIOLET,
              color: workflow.type === "assistant" ? "var(--on-accent)" : "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {workflow.type === "assistant" ? "AI" : "TB"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="flex flex-wrap items-center gap-2">
              <div style={{ fontSize: 15, fontWeight: 600, color: c.t1 }}>{workflow.name}</div>
              <WorkflowBadge
                label={workflow.is_builtin ? "Built-in" : "Custom"}
                color={workflow.is_builtin ? c.t3 : typeColor}
                background={workflow.is_builtin ? c.surfaceAlt : tint(typeColor, 14)}
                border={workflow.is_builtin ? c.border : tint(typeColor, 28)}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <WorkflowBadge
                label={workflow.type === "assistant" ? "Assistant workflow" : "Tabular workflow"}
                color={workflow.is_builtin ? c.t2 : typeColor}
                background={workflow.is_builtin ? c.surfaceAlt : tint(typeColor, 10)}
                border={workflow.is_builtin ? c.border : tint(typeColor, 22)}
              />
              {workflow.variables.length > 0 && (
                <WorkflowBadge
                  label={`${workflow.variables.length} variable${workflow.variables.length === 1 ? "" : "s"}`}
                  color={c.t2}
                  background={c.surfaceAlt}
                  border={c.border}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: c.t2, minHeight: 66 }}>
        {workflow.description || "No description yet."}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {meta.map((item) => (
          <div
            key={item.label}
            style={{
              padding: "10px 10px",
              borderRadius: 16,
              background: c.surfaceAlt,
              border: `1px solid ${c.border}`,
              minWidth: 0,
            }}
          >
            <div
              className="font-mono-plex"
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: c.t3,
              }}
            >
              {item.label}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: c.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        <button
          type="button"
          onClick={onRun}
          disabled={!onRun}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: onRun ? ACCENT : c.surfaceAlt,
            color: onRun ? "white" : c.t3,
            border: "none",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            cursor: onRun ? "pointer" : "not-allowed",
          }}
        >
          {runLabel}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {primaryAction.onClick && (
            <CardButton label={primaryAction.label} onClick={primaryAction.onClick} theme={theme} />
          )}
          {onHistory && <CardButton label="History" onClick={onHistory} theme={theme} />}
          {onDelete && !workflow.is_builtin && (
            <CardButton label="Delete" onClick={onDelete} theme={theme} danger />
          )}
        </div>
      </div>
    </article>
  );
}

function WorkflowBadge({
  label,
  color,
  background,
  border,
}: {
  label: string;
  color: string;
  background: string;
  border: string;
}) {
  return (
    <span
      className="font-mono-plex"
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "4px 8px",
        borderRadius: 999,
        color,
        background,
        border: `1px solid ${border}`,
      }}
    >
      {label}
    </span>
  );
}

function CardButton({
  label,
  onClick,
  theme,
  danger,
}: {
  label: string;
  onClick?: () => void;
  theme: Theme;
  danger?: boolean;
}) {
  const c = ddTheme(theme);
  const fg = danger ? "#c2410c" : c.t1;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "9px 12px",
        background: c.surfaceAlt,
        color: fg,
        border: `1px solid ${danger ? "#f5c7b3" : c.border}`,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
