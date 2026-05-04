"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cloneWorkflow,
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  startWorkflowRun,
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
import DocumentSelectorModal from "./DocumentSelectorModal";
import TabularRun from "./TabularRun";

type Theme = "light" | "dark";

interface WorkflowsViewProps {
  dealId: string;
  theme: Theme;
}

type ScreenState =
  | { kind: "library" }
  | { kind: "editor"; workflowId: string }
  | { kind: "create"; type: WorkflowType }
  | { kind: "run"; workflowId: string; runId: string };

export default function WorkflowsView({ dealId, theme }: WorkflowsViewProps) {
  const c = ddTheme(theme);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenState>({ kind: "library" });
  /** When non-null, the doc-selector modal is open for this workflow id. */
  const [runModalWorkflowId, setRunModalWorkflowId] = useState<string | null>(null);
  const [runStartError, setRunStartError] = useState<string | null>(null);

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

  const handleRunRequested = useCallback((workflowId: string) => {
    setRunStartError(null);
    setRunModalWorkflowId(workflowId);
  }, []);

  const handleRunConfirmed = useCallback(
    async (workflowId: string, documentIds: string[]) => {
      setRunStartError(null);
      try {
        const run = await startWorkflowRun(dealId, workflowId, documentIds);
        setRunModalWorkflowId(null);
        setScreen({ kind: "run", workflowId, runId: run.id });
      } catch (err) {
        setRunStartError(err instanceof Error ? err.message : "Failed to start run");
      }
    },
    [dealId]
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

  // Modal lives outside the screen switch so it overlays whatever screen is active.
  const modalWorkflow = runModalWorkflowId
    ? workflows.find((w) => w.id === runModalWorkflowId) ?? null
    : null;
  const renderModal = () => (
    <>
      {modalWorkflow && (
        <DocumentSelectorModal
          dealId={dealId}
          workflowName={modalWorkflow.name}
          theme={theme}
          onCancel={() => {
            setRunModalWorkflowId(null);
            setRunStartError(null);
          }}
          onConfirm={(docIds) => handleRunConfirmed(modalWorkflow.id, docIds)}
        />
      )}
      {runStartError && modalWorkflow && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#7f1d1d",
            color: "#fecaca",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 12,
            zIndex: 1100,
          }}
        >
          {runStartError}
        </div>
      )}
    </>
  );

  if (screen.kind === "run") {
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
    return (
      <>
        <TabularRun
          dealId={dealId}
          runId={screen.runId}
          workflow={workflow}
          theme={theme}
          onBack={() => setScreen({ kind: "library" })}
        />
        {renderModal()}
      </>
    );
  }

  if (screen.kind === "library") {
    return (
      <>
        <WorkflowLibrary
          dealId={dealId}
          workflows={workflows}
          theme={theme}
          onClone={handleClone}
          onEdit={handleEdit}
          onNew={handleNew}
          onRun={handleRunRequested}
        />
        {renderModal()}
      </>
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
