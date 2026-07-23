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
    workflow.type === "assistant"
      ? `${workflow.stages.length} stage${workflow.stages.length === 1 ? "" : "s"}`
      : `${workflow.columns.length} column${workflow.columns.length === 1 ? "" : "s"}`,
    workflow.row_source === "multi_doc_synthesis" ? "Multi-doc" : "One-doc",
    `Updated ${formatRelativeShort(workflow.updated_at)}`,
  ];

  return (
    <article
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 15,
        display: "flex",
        flexDirection: "column",
        gap: 11,
        boxShadow: isDark
          ? "0 8px 24px rgba(0,0,0,0.35)"
          : "0 6px 18px rgba(17,17,17,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3" style={{ minWidth: 0 }}>
          <div
            className="font-mono-plex"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: tint(typeColor, 13),
              color: typeColor,
              border: `1px solid ${tint(typeColor, 28)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.02em",
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
                color={typeColor}
                background={tint(typeColor, 10)}
                border={tint(typeColor, 22)}
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
        className="font-mono-plex"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 10.5, letterSpacing: "0.03em", color: c.t3 }}
      >
        {meta.map((m, i) => (
          <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ opacity: 0.55 }}>·</span>}
            <span>{m}</span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
        <button
          type="button"
          onClick={onRun}
          disabled={!onRun}
          onMouseEnter={(e) => {
            if (!onRun) return;
            e.currentTarget.style.background = ACCENT;
            e.currentTarget.style.color = "var(--on-accent)";
            e.currentTarget.style.borderColor = "transparent";
          }}
          onMouseLeave={(e) => {
            if (!onRun) return;
            e.currentTarget.style.background = "var(--accent-tint)";
            e.currentTarget.style.color = ACCENT;
            e.currentTarget.style.borderColor = "var(--accent-tint-border)";
          }}
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px 12px",
            background: onRun ? "var(--accent-tint)" : c.surfaceAlt,
            color: onRun ? ACCENT : c.t3,
            border: `1px solid ${onRun ? "var(--accent-tint-border)" : c.border}`,
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: onRun ? "pointer" : "not-allowed",
            transition: "background .12s, color .12s, border-color .12s",
          }}
        >
          {runLabel}
          {onRun && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>

        {primaryAction.onClick && (
          <CardButton label={primaryAction.label} onClick={primaryAction.onClick} theme={theme} />
        )}
        {onHistory && <CardButton label="History" onClick={onHistory} theme={theme} />}
        {onDelete && !workflow.is_builtin && (
          <CardButton label="Delete" onClick={onDelete} theme={theme} danger />
        )}
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
        padding: "3px 7px",
        borderRadius: 5,
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
        padding: "8px 11px",
        background: c.surfaceAlt,
        color: fg,
        border: `1px solid ${danger ? "#f5c7b3" : c.border}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
