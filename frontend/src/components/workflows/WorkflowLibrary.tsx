"use client";

import { useMemo, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import type { Workflow, WorkflowType } from "@/lib/workflows";
import WorkflowCard from "./WorkflowCard";

type Theme = "light" | "dark";

interface WorkflowLibraryProps {
  dealId: string;
  workflows: Workflow[];
  theme: Theme;
  onClone: (workflowId: string) => void;
  onEdit: (workflowId: string) => void;
  onNew: (type: WorkflowType) => void;
  /** Open the doc-selector modal to start a run (tabular or assistant). */
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
  const [query, setQuery] = useState("");
  const [showNewMenu, setShowNewMenu] = useState(false);

  const { builtIns, customs } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (w: Workflow) =>
      !q || w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
    return {
      builtIns: workflows.filter((w) => w.is_builtin && matches(w)),
      customs: workflows.filter((w) => !w.is_builtin && matches(w)),
    };
  }, [workflows, query]);

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        background: c.bg,
        color: c.t1,
        overflowY: "auto",
        padding: "24px 32px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: c.t1 }}>Workflows</h2>
          <p style={{ fontSize: 13, color: c.t2, margin: "4px 0 0" }}>
            Reusable templates that turn deal documents into structured outputs.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows..."
            style={{
              width: 240,
              padding: "7px 12px",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              color: c.t1,
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => setShowNewMenu((v) => !v)}
            style={{
              padding: "7px 14px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + New Workflow
          </button>
          {showNewMenu && (
            <div
              style={{
                position: "absolute",
                top: 38,
                right: 0,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,.18)",
                zIndex: 10,
                minWidth: 220,
                padding: 4,
              }}
            >
              <NewMenuButton
                title="Assistant workflow"
                subtitle="Multi-stage prompt pipeline → memo"
                onClick={() => {
                  setShowNewMenu(false);
                  onNew("assistant");
                }}
                theme={theme}
              />
              <NewMenuButton
                title="Tabular workflow"
                subtitle="Column-based extraction grid"
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

      <Section
        title="Built-in Templates"
        right={
          <span style={{ fontSize: 11, color: c.t3 }}>
            {builtIns.length} workflow{builtIns.length === 1 ? "" : "s"}
          </span>
        }
        theme={theme}
      >
        {builtIns.length === 0 ? (
          <EmptyState text="No built-in templates match your search." theme={theme} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 12,
            }}
          >
            {builtIns.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                theme={theme}
                onClone={() => onClone(wf.id)}
                onRun={onRun ? () => onRun(wf.id) : undefined}
                onHistory={onHistory ? () => onHistory(wf.id) : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Custom Workflows"
        right={
          <span style={{ fontSize: 11, color: c.t3 }}>
            {customs.length} workflow{customs.length === 1 ? "" : "s"}
          </span>
        }
        theme={theme}
      >
        {customs.length === 0 ? (
          <div
            style={{
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>+</div>
            <div style={{ fontSize: 13, color: c.t2, marginBottom: 12 }}>
              No custom workflows yet for this deal
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              <button
                onClick={() => onNew("assistant")}
                style={{
                  padding: "6px 12px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Assistant
              </button>
              <button
                onClick={() => onNew("tabular")}
                style={{
                  padding: "6px 12px",
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Tabular
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 12,
            }}
          >
            {customs.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                theme={theme}
                onEdit={() => onEdit(wf.id)}
                onRun={onRun ? () => onRun(wf.id) : undefined}
                onHistory={onHistory ? () => onHistory(wf.id) : undefined}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  right,
  theme,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  theme: Theme;
  children: React.ReactNode;
}) {
  const c = ddTheme(theme);
  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: c.t3,
          }}
        >
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, theme }: { text: string; theme: Theme }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        background: c.surface,
        border: `1px dashed ${c.border}`,
        borderRadius: 10,
        padding: 24,
        textAlign: "center",
        color: c.t3,
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}

function NewMenuButton({
  title,
  subtitle,
  onClick,
  theme,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        color: c.t1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = c.surfaceAlt)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: c.t2, marginTop: 2 }}>{subtitle}</div>
    </button>
  );
}
