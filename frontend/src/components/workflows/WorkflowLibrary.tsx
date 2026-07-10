import { useMemo, useState, type ReactNode } from "react";
import { ddTheme } from "@/components/dd/types";
import type { Workflow, WorkflowType } from "@/lib/workflows";
import { ACCENT, VIOLET } from "./theme";
import WorkflowCard from "./WorkflowCard";

type Theme = "light" | "dark";

interface WorkflowLibraryProps {
  dealId: string;
  workflows: Workflow[];
  theme: Theme;
  onClone: (workflowId: string) => void;
  onEdit: (workflowId: string) => void;
  onNew: (type: WorkflowType) => void;
  onRun?: (workflowId: string) => void;
  onHistory?: (workflowId: string) => void;
}

export default function WorkflowLibrary({
  workflows,
  theme,
  onClone,
  onEdit,
  onNew,
  onRun,
  onHistory,
}: WorkflowLibraryProps) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [query, setQuery] = useState("");
  const [showNewMenu, setShowNewMenu] = useState(false);

  const { builtIns, customs } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (workflow: Workflow) =>
      !q ||
      workflow.name.toLowerCase().includes(q) ||
      workflow.description.toLowerCase().includes(q);

    return {
      builtIns: workflows.filter((workflow) => workflow.is_builtin && matches(workflow)),
      customs: workflows.filter((workflow) => !workflow.is_builtin && matches(workflow)),
    };
  }, [workflows, query]);

  const assistantCount = workflows.filter((workflow) => workflow.type === "assistant").length;
  const tabularCount = workflows.filter((workflow) => workflow.type === "tabular").length;
  const customCount = workflows.filter((workflow) => !workflow.is_builtin).length;

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        background: c.bg,
        color: c.t1,
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div
          style={{
            padding: "20px",
            borderRadius: 28,
            border: `1px solid ${c.border}`,
            background: c.surface,
            boxShadow: isDark ? "0 18px 40px rgba(0,0,0,0.24)" : "0 18px 40px rgba(17,17,17,0.05)",
            marginBottom: 20,
          }}
        >
          <div
            className="font-mono-plex"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: c.t3,
            }}
          >
            Workflow workspace
          </div>

          <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div style={{ maxWidth: 720 }}>
              <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 600, color: c.t1 }}>
                Templates that turn diligence into repeatable output
              </h2>
              <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7, color: c.t2 }}>
                Start from built-ins for common deal work, then clone or create custom workflows for your own memo, extraction, and synthesis patterns.
              </p>
            </div>

            <div style={{ position: "relative", width: "100%", maxWidth: 460 }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div style={{ position: "relative", flex: 1 }}>
                  <svg
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 14,
                      height: 14,
                      color: c.t3,
                    }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search workflows"
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 38px",
                      background: c.surfaceAlt,
                      border: `1px solid ${c.border}`,
                      borderRadius: 999,
                      color: c.t1,
                      fontSize: 13,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewMenu((value) => !value)}
                  style={{
                    padding: "11px 16px",
                    background: ACCENT,
                    color: "var(--on-accent)",
                    border: "none",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  New workflow
                </button>
              </div>

              {showNewMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "min(320px, 100%)",
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    borderRadius: 20,
                    boxShadow: isDark ? "0 24px 44px rgba(0,0,0,0.32)" : "0 24px 44px rgba(17,17,17,0.08)",
                    zIndex: 10,
                    padding: 8,
                  }}
                >
                  <NewMenuButton
                    title="Assistant workflow"
                    subtitle="Multi-stage prompt chain that writes a memo or synthesis deliverable."
                    accent={ACCENT}
                    onClick={() => {
                      setShowNewMenu(false);
                      onNew("assistant");
                    }}
                    theme={theme}
                  />
                  <NewMenuButton
                    title="Tabular workflow"
                    subtitle="Column-driven extraction grid for comparable outputs across documents."
                    accent={VIOLET}
                    onClick={() => {
                      setShowNewMenu(false);
                      onNew("tabular");
                    }}
                    theme={theme}
                  />
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10,
              marginTop: 18,
            }}
          >
            <MetricTile
              theme={theme}
              label="Visible"
              value={builtIns.length + customs.length}
              detail={query.trim() ? "Matching current search" : "Ready to use"}
            />
            <MetricTile
              theme={theme}
              label="Built-in"
              value={workflows.filter((workflow) => workflow.is_builtin).length}
              detail="Curated starting points"
            />
            <MetricTile
              theme={theme}
              label="Custom"
              value={customCount}
              detail="Team-owned workflows"
            />
            <MetricTile
              theme={theme}
              label="Assistant"
              value={assistantCount}
              detail="Narrative synthesis"
            />
            <MetricTile
              theme={theme}
              label="Tabular"
              value={tabularCount}
              detail="Structured extraction"
            />
          </div>
        </div>

        <Section
          title="Built-in Templates"
          subtitle="Start here when you need a known workflow shape with proven prompts and structure."
          right={
            <span style={{ fontSize: 11, color: c.t3 }}>
              {builtIns.length} workflow{builtIns.length === 1 ? "" : "s"}
            </span>
          }
          theme={theme}
        >
          {builtIns.length === 0 ? (
            <EmptyState
              title="No built-in templates match"
              text="Try another search term or clear the current filter."
              theme={theme}
            />
          ) : (
            <CardGrid>
              {builtIns.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  theme={theme}
                  onClone={() => onClone(workflow.id)}
                  onRun={onRun ? () => onRun(workflow.id) : undefined}
                  onHistory={onHistory ? () => onHistory(workflow.id) : undefined}
                />
              ))}
            </CardGrid>
          )}
        </Section>

        <Section
          title="Custom Workflows"
          subtitle="Clone built-ins or create originals when you need deal-specific logic, shapes, or deliverables."
          right={
            <span style={{ fontSize: 11, color: c.t3 }}>
              {customs.length} workflow{customs.length === 1 ? "" : "s"}
            </span>
          }
          theme={theme}
        >
          {customs.length === 0 ? (
            <EmptyState
              title="No custom workflows yet"
              text="Create an assistant or tabular workflow to capture your team’s own diligence process."
              theme={theme}
              action={
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <QuickCreateButton label="Assistant" accent={ACCENT} onClick={() => onNew("assistant")} />
                  <QuickCreateButton label="Tabular" accent={VIOLET} onClick={() => onNew("tabular")} />
                </div>
              }
            />
          ) : (
            <CardGrid>
              {customs.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  theme={theme}
                  onEdit={() => onEdit(workflow.id)}
                  onRun={onRun ? () => onRun(workflow.id) : undefined}
                  onHistory={onHistory ? () => onHistory(workflow.id) : undefined}
                />
              ))}
            </CardGrid>
          )}
        </Section>
      </div>
    </div>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  subtitle,
  right,
  theme,
  children,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
  theme: Theme;
  children: ReactNode;
}) {
  const c = ddTheme(theme);

  return (
    <section
      style={{
        marginTop: 22,
        padding: "18px 0 0",
        borderTop: `1px solid ${c.border}`,
      }}
    >
      <div
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div
            className="font-mono-plex"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: c.t3,
            }}
          >
            {title}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.65, color: c.t2 }}>{subtitle}</div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function MetricTile({
  label,
  value,
  detail,
  theme,
}: {
  label: string;
  value: number;
  detail: string;
  theme: Theme;
}) {
  const c = ddTheme(theme);

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 20,
        border: `1px solid ${c.border}`,
        background: c.surfaceAlt,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: c.t3,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 24, lineHeight: 1, fontWeight: 600, color: c.t1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: c.t2 }}>{detail}</div>
    </div>
  );
}

function EmptyState({
  title,
  text,
  theme,
  action,
}: {
  title: string;
  text: string;
  theme: Theme;
  action?: ReactNode;
}) {
  const c = ddTheme(theme);

  return (
    <div
      style={{
        background: c.surface,
        border: `1px dashed ${c.border}`,
        borderRadius: 24,
        padding: "30px 18px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: c.t1 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: c.t2 }}>{text}</div>
      {action}
    </div>
  );
}

function QuickCreateButton({
  label,
  accent,
  onClick,
}: {
  label: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 14px",
        background: accent,
        color: accent === ACCENT ? "var(--on-accent)" : "var(--on-violet)",
        border: "none",
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

function NewMenuButton({
  title,
  subtitle,
  accent,
  onClick,
  theme,
}: {
  title: string;
  subtitle: string;
  accent: string;
  onClick: () => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 12px",
        background: "transparent",
        border: "none",
        borderRadius: 16,
        cursor: "pointer",
        color: c.t1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = c.surfaceAlt;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="flex items-start gap-3">
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            background: accent,
            color: accent === ACCENT ? "var(--on-accent)" : "var(--on-violet)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {title.startsWith("Assistant") ? "A" : "T"}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{title}</span>
          <span style={{ display: "block", marginTop: 3, fontSize: 12, lineHeight: 1.6, color: c.t2 }}>
            {subtitle}
          </span>
        </span>
      </div>
    </button>
  );
}
