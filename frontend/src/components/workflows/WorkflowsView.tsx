"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cloneWorkflow,
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  updateWorkflow,
  Workflow,
  WorkflowCreatePayload,
  WorkflowType,
  WorkflowUpdatePayload,
} from "@/lib/workflows";
import { ddTheme } from "@/components/dd/types";
import WorkflowLibrary from "./WorkflowLibrary";
import AssistantEditor from "./AssistantEditor";
import TabularEditor from "./TabularEditor";

type Theme = "light" | "dark";

interface WorkflowsViewProps {
  dealId: string;
  theme: Theme;
}

type ScreenState =
  | { kind: "library" }
  | { kind: "editor"; workflowId: string }
  | { kind: "create"; type: WorkflowType };

export default function WorkflowsView({ dealId, theme }: WorkflowsViewProps) {
  const c = ddTheme(theme);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenState>({ kind: "library" });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listWorkflows(dealId);
      setWorkflows(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClone = useCallback(
    async (workflowId: string) => {
      try {
        const cloned = await cloneWorkflow(dealId, workflowId);
        await refresh();
        setScreen({ kind: "editor", workflowId: cloned.id });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clone workflow");
      }
    },
    [dealId, refresh]
  );

  const handleEdit = useCallback((workflowId: string) => {
    setScreen({ kind: "editor", workflowId });
  }, []);

  const handleNew = useCallback((type: WorkflowType) => {
    setScreen({ kind: "create", type });
  }, []);

  const handleDelete = useCallback(
    async (workflowId: string) => {
      try {
        await deleteWorkflow(dealId, workflowId);
        await refresh();
        setScreen({ kind: "library" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete workflow");
      }
    },
    [dealId, refresh]
  );

  const handleSave = useCallback(
    async (workflowId: string, payload: WorkflowUpdatePayload) => {
      try {
        await updateWorkflow(dealId, workflowId, payload);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save workflow");
      }
    },
    [dealId, refresh]
  );

  const handleCreate = useCallback(
    async (payload: WorkflowCreatePayload) => {
      try {
        const created = await createWorkflow(dealId, payload);
        await refresh();
        setScreen({ kind: "editor", workflowId: created.id });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create workflow");
      }
    },
    [dealId, refresh]
  );

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.t2,
          fontSize: 13,
        }}
      >
        <div
          className="dd-spin"
          style={{
            width: 24,
            height: 24,
            border: `3px solid ${c.border}`,
            borderTopColor: "#2563eb",
            borderRadius: "50%",
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: c.t1,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Couldn’t load workflows</div>
        <div style={{ fontSize: 12, color: c.t2, textAlign: "center", maxWidth: 480 }}>{error}</div>
        <button
          onClick={refresh}
          style={{
            padding: "6px 12px",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (screen.kind === "library") {
    return (
      <WorkflowLibrary
        dealId={dealId}
        workflows={workflows}
        theme={theme}
        onClone={handleClone}
        onEdit={handleEdit}
        onNew={handleNew}
      />
    );
  }

  if (screen.kind === "create") {
    if (screen.type === "assistant") {
      return (
        <AssistantEditor
          theme={theme}
          mode="create"
          onCreate={handleCreate}
          onBack={() => setScreen({ kind: "library" })}
        />
      );
    }
    return (
      <TabularEditor
        theme={theme}
        mode="create"
        onCreate={handleCreate}
        onBack={() => setScreen({ kind: "library" })}
      />
    );
  }

  // screen.kind === "editor"
  const workflow = workflows.find((w) => w.id === screen.workflowId);
  if (!workflow) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.t2,
          fontSize: 13,
        }}
      >
        Workflow not found.
      </div>
    );
  }

  if (workflow.type === "assistant") {
    return (
      <AssistantEditor
        theme={theme}
        mode="edit"
        workflow={workflow}
        onSave={(payload) => handleSave(workflow.id, payload)}
        onDelete={workflow.is_builtin ? undefined : () => handleDelete(workflow.id)}
        onBack={() => setScreen({ kind: "library" })}
      />
    );
  }

  return (
    <TabularEditor
      theme={theme}
      mode="edit"
      workflow={workflow}
      onSave={(payload) => handleSave(workflow.id, payload)}
      onDelete={workflow.is_builtin ? undefined : () => handleDelete(workflow.id)}
      onBack={() => setScreen({ kind: "library" })}
    />
  );
}
