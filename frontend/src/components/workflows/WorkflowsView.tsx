"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cloneWorkflow,
  createWorkflow,
  deleteWorkflow,
  listRuns,
  listWorkflows,
  startWorkflowRun,
  updateWorkflow,
  Workflow,
  WorkflowCreatePayload,
  WorkflowRun,
  WorkflowType,
  WorkflowUpdatePayload,
} from "@/lib/workflows";
import { ddTheme } from "@/components/dd/types";
import WorkflowLibrary from "./WorkflowLibrary";
import AssistantEditor from "./AssistantEditor";
import TabularEditor from "./TabularEditor";
import DocumentSelectorModal from "./DocumentSelectorModal";
import TabularRun from "./TabularRun";
import AssistantRun from "./AssistantRun";
import MemoOutput from "./MemoOutput";

type Theme = "light" | "dark";

interface WorkflowsViewProps {
  dealId: string;
  theme: Theme;
}

type ScreenState =
  | { kind: "library" }
  | { kind: "editor"; workflowId: string }
  | { kind: "create"; type: WorkflowType }
  | { kind: "run"; workflowId: string; runId: string }
  | { kind: "memo"; workflowId: string; runId: string };

export default function WorkflowsView({ dealId, theme }: WorkflowsViewProps) {
  const c = ddTheme(theme);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenState>({ kind: "library" });
  /** When non-null, the doc-selector modal is open for this workflow id. */
  const [runModalWorkflowId, setRunModalWorkflowId] = useState<string | null>(null);
  const [historyWorkflowId, setHistoryWorkflowId] = useState<string | null>(null);
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
      // If we've already cloned this built-in for this deal, opening that
      // existing copy is almost always what the analyst wants. Cloning silently
      // a second time was generating a graveyard of duplicate "QofE Bridge (Copy)"
      // workflows in the library and making analysts think their saves had
      // reverted. Surface the choice instead of guessing.
      const existing = workflows.filter(
        (w) => !w.is_builtin && w.cloned_from === workflowId
      );
      if (existing.length > 0) {
        const mostRecent = existing
          .slice()
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
        const open = window.confirm(
          `You already have ${existing.length === 1 ? "a copy" : `${existing.length} copies`} of this workflow ("${mostRecent.name}"). ` +
            `Click OK to open the most recent copy, or Cancel to make a brand-new copy.`
        );
        if (open) {
          setScreen({ kind: "editor", workflowId: mostRecent.id });
          return;
        }
      }
      try {
        const cloned = await cloneWorkflow(dealId, workflowId);
        await refresh();
        setScreen({ kind: "editor", workflowId: cloned.id });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clone workflow");
      }
    },
    [dealId, refresh, workflows]
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
    async (workflowId: string, documentIds: string[], synthesisQuestions: string[] = []) => {
      setRunStartError(null);
      try {
        const run = await startWorkflowRun(dealId, workflowId, documentIds, synthesisQuestions);
        setRunModalWorkflowId(null);
        setScreen({ kind: "run", workflowId, runId: run.id });
      } catch (err) {
        setRunStartError(err instanceof Error ? err.message : "Failed to start run");
      }
    },
    [dealId]
  );

  const handleOpenRun = useCallback((workflow: Workflow, run: WorkflowRun) => {
    setHistoryWorkflowId(null);
    if (workflow.type === "assistant" && run.status === "complete") {
      setScreen({ kind: "memo", workflowId: workflow.id, runId: run.id });
    } else {
      setScreen({ kind: "run", workflowId: workflow.id, runId: run.id });
    }
  }, []);

  // Only block on the initial fetch — subsequent refreshes happen in the
  // background so we don't unmount the editor mid-save (which used to wipe
  // its "Saved" indicator and confuse the user into thinking nothing happened).
  if (loading && workflows.length === 0) {
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
  const historyWorkflow = historyWorkflowId
    ? workflows.find((w) => w.id === historyWorkflowId) ?? null
    : null;
  const renderModal = () => (
    <>
      {modalWorkflow && (
        <DocumentSelectorModal
          dealId={dealId}
          workflowName={modalWorkflow.name}
          rowSource={modalWorkflow.row_source}
          theme={theme}
          onCancel={() => {
            setRunModalWorkflowId(null);
            setRunStartError(null);
          }}
          onConfirm={(docIds, questions) =>
            handleRunConfirmed(modalWorkflow.id, docIds, questions ?? [])
          }
        />
      )}
      {historyWorkflow && (
        <RunHistoryModal
          dealId={dealId}
          workflow={historyWorkflow}
          theme={theme}
          onClose={() => setHistoryWorkflowId(null)}
          onOpen={(run) => handleOpenRun(historyWorkflow, run)}
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

  if (screen.kind === "run" || screen.kind === "memo") {
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
      if (screen.kind === "memo") {
        return (
          <>
            <MemoOutput
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
      return (
        <>
          <AssistantRun
            dealId={dealId}
            runId={screen.runId}
            workflow={workflow}
            theme={theme}
            onBack={() => setScreen({ kind: "library" })}
            onComplete={() => setScreen({ kind: "memo", workflowId: workflow.id, runId: screen.runId })}
          />
          {renderModal()}
        </>
      );
    }
    // Tabular: only "run" makes sense; "memo" is unreachable in current UX.
    return (
      <>
        <TabularRun
          dealId={dealId}
          runId={screen.runId}
          workflow={workflow}
          theme={theme}
          onBack={() => setScreen({ kind: "library" })}
          onWorkflowChange={(updated) =>
            setWorkflows((prev) =>
              prev.map((w) => (w.id === updated.id ? updated : w))
            )
          }
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
          onHistory={(workflowId) => setHistoryWorkflowId(workflowId)}
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

function RunHistoryModal({
  dealId,
  workflow,
  theme,
  onClose,
  onOpen,
}: {
  dealId: string;
  workflow: Workflow;
  theme: Theme;
  onClose: () => void;
  onOpen: (run: WorkflowRun) => void;
}) {
  const c = ddTheme(theme);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listRuns(dealId, workflow.id)
      .then((items) => {
        if (active) setRuns(items);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load run history");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflow.id]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92vw)",
          height: "100%",
          background: c.surface,
          borderLeft: `1px solid ${c.border}`,
          padding: 18,
          overflowY: "auto",
          boxShadow: "-16px 0 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.t1 }}>Run history</div>
            <div style={{ fontSize: 12, color: c.t2, marginTop: 2 }}>{workflow.name}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: c.surfaceAlt,
              color: c.t2,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ color: c.t2, fontSize: 12 }}>Loading runs...</div>
        ) : error ? (
          <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>
        ) : runs.length === 0 ? (
          <div style={{ color: c.t3, fontSize: 12 }}>No runs yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map((run) => (
              <button
                key={run.id}
                onClick={() => onOpen(run)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  background: c.surfaceAlt,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  color: c.t1,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Run #{run.run_number}</span>
                  <span style={{ fontSize: 10, color: statusColor(run.status), fontWeight: 700, textTransform: "uppercase" }}>
                    {run.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: c.t3, marginTop: 4 }}>
                  {formatRunDate(run.completed_at ?? run.started_at)} · {run.document_ids.length} doc
                  {run.document_ids.length === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusColor(status: WorkflowRun["status"]): string {
  if (status === "complete") return "#22c55e";
  if (status === "error" || status === "cancelled") return "#ef4444";
  if (status === "checkpoint") return "#f59e0b";
  return "#2563eb";
}

function formatRunDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
