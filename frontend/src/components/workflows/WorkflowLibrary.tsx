import { useMemo, useState, type ReactNode } from "react";
import type { Workflow, WorkflowType } from "@/lib/workflows";
import { ACCENT, VIOLET } from "./theme";
import WorkflowCard from "./WorkflowCard";
import Button from "@/components/ui/Button";

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
      className="bg-appbg text-t1"
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div
          className="border border-edge bg-surface"
          style={{
            padding: "18px 20px",
            borderRadius: 16,
            boxShadow: isDark
              ? "0 10px 30px rgba(0,0,0,0.35)"
              : "0 8px 24px rgba(17,17,17,0.06)",
            marginBottom: 16,
          }}
        >
          <div
            className="font-mono-plex text-t3"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Workflow workspace
          </div>

          <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div style={{ maxWidth: 720 }}>
              <h2 className="text-t1" style={{ margin: 0, fontSize: 20, lineHeight: 1.2, fontWeight: 600 }}>
                Templates that turn diligence into repeatable output
              </h2>
              <p className="text-t2" style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.6 }}>
                Start from built-ins, then clone or create custom workflows for your own memo, extraction, and synthesis patterns.
              </p>
              <div className="text-t2" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                {([
                  [builtIns.length + customs.length, "workflows"],
                  [workflows.filter((workflow) => workflow.is_builtin).length, "built-in"],
                  [customCount, "custom"],
                  [assistantCount, "assistant"],
                  [tabularCount, "tabular"],
                ] as [number, string][]).map(([n, l], i) => (
                  <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {i > 0 && <span className="text-t3">·</span>}
                    <span>
                      <span className="text-accent" style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{n}</span> {l}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div style={{ position: "relative", width: "100%", maxWidth: 460 }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div style={{ position: "relative", flex: 1 }}>
                  <svg
                    className="text-t3"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 14,
                      height: 14,
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
                    className="border border-edge bg-surface-alt text-t1"
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 36px",
                      borderRadius: 9,
                      fontSize: 13,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <Button
                  variant="secondary"
                  onClick={() => setShowNewMenu((value) => !value)}
                >
                  New workflow
                </Button>
              </div>

              {showNewMenu && (
                <div
                  className="border border-edge bg-surface"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "min(320px, 100%)",
                    borderRadius: 12,
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
                  />
                  <NewMenuButton
                    title="Tabular workflow"
                    subtitle="Column-driven extraction grid for comparable outputs across documents."
                    accent={VIOLET}
                    onClick={() => {
                      setShowNewMenu(false);
                      onNew("tabular");
                    }}
                  />
                </div>
              )}
            </div>
          </div>

        </div>

        <Section
          title="Built-in Templates"
          subtitle="Start here when you need a known workflow shape with proven prompts and structure."
          right={
            <span className="text-t3" style={{ fontSize: 11 }}>
              {builtIns.length} workflow{builtIns.length === 1 ? "" : "s"}
            </span>
          }
        >
          {builtIns.length === 0 ? (
            <EmptyState
              title="No built-in templates match"
              text="Try another search term or clear the current filter."
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
            <span className="text-t3" style={{ fontSize: 11 }}>
              {customs.length} workflow{customs.length === 1 ? "" : "s"}
            </span>
          }
        >
          {customs.length === 0 ? (
            <EmptyState
              title="No custom workflows yet"
              text="Create an assistant or tabular workflow to capture your team’s own diligence process."
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
  children,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="border-t border-t-edge"
      style={{
        marginTop: 22,
        padding: "18px 0 0",
      }}
    >
      <div
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div
            className="font-mono-plex text-t3"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
          <div className="text-t2" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.65 }}>{subtitle}</div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="border border-dashed border-edge bg-surface"
      style={{
        borderRadius: 12,
        padding: "30px 18px",
        textAlign: "center",
      }}
    >
      <div className="text-t1" style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <div className="text-t2" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>{text}</div>
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
        padding: "9px 14px",
        background: accent,
        color: accent === ACCENT ? "var(--on-accent)" : "var(--on-violet)",
        border: "none",
        borderRadius: 9,
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
}: {
  title: string;
  subtitle: string;
  accent: string;
  onClick: () => void;
}) {
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
        borderRadius: 10,
        cursor: "pointer",
        color: "var(--text-1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-alt)";
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
          <span className="text-t2" style={{ display: "block", marginTop: 3, fontSize: 12, lineHeight: 1.6 }}>
            {subtitle}
          </span>
        </span>
      </div>
    </button>
  );
}
