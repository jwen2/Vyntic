import type { Workflow } from "@/lib/workflows";
import { formatRelativeShort, tint, workflowTypeColor } from "./theme";
import Button from "@/components/ui/Button";

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
      className="bg-surface border border-edge"
      style={{
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
              <div className="text-t1" style={{ fontSize: 15, fontWeight: 600 }}>{workflow.name}</div>
              <WorkflowBadge
                label={workflow.is_builtin ? "Built-in" : "Custom"}
                color={workflow.is_builtin ? "var(--text-3)" : typeColor}
                background={workflow.is_builtin ? "var(--surface-alt)" : tint(typeColor, 14)}
                border={workflow.is_builtin ? "var(--border)" : tint(typeColor, 28)}
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
                  color="var(--text-2)"
                  background="var(--surface-alt)"
                  border="var(--border)"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-t2" style={{ margin: 0, fontSize: 13, lineHeight: 1.7, minHeight: 66 }}>
        {workflow.description || "No description yet."}
      </p>

      <div
        className="font-mono-plex text-t3"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 10.5, letterSpacing: "0.03em" }}
      >
        {meta.map((m, i) => (
          <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ opacity: 0.55 }}>·</span>}
            <span>{m}</span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
        <Button
          variant="primary"
          size="sm"
          onClick={onRun}
          disabled={!onRun}
          style={{ flex: 1 }}
          iconRight={
            onRun ? (
              <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            ) : undefined
          }
        >
          {runLabel}
        </Button>

        {primaryAction.onClick && (
          <Button variant="secondary" size="sm" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        )}
        {onHistory && (
          <Button variant="secondary" size="sm" onClick={onHistory}>
            History
          </Button>
        )}
        {onDelete && !workflow.is_builtin && (
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
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
