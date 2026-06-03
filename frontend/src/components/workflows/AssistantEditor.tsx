
import { useEffect, useMemo, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import type {
  OutputFormat,
  Workflow,
  WorkflowCreatePayload,
  WorkflowStage,
  WorkflowStageInput,
  WorkflowUpdatePayload,
} from "@/lib/workflows";
import { ACCENT, AMBER } from "./theme";

type Theme = "light" | "dark";

type EditorMode =
  | { mode: "create"; onCreate: (payload: WorkflowCreatePayload) => void | Promise<void> }
  | {
      mode: "edit";
      workflow: Workflow;
      onSave: (payload: WorkflowUpdatePayload) => void | Promise<void>;
      onDelete?: () => void | Promise<void>;
    };

type AssistantEditorProps = EditorMode & {
  theme: Theme;
  onBack: () => void;
};

interface DraftStage extends WorkflowStageInput {
  // Required for keyed list rendering before save assigns an id.
  uid: string;
}

function stageToDraft(stage: WorkflowStage): DraftStage {
  return {
    uid: stage.id,
    id: stage.id,
    order_index: stage.order_index,
    label: stage.label,
    prompt_md: stage.prompt_md,
    checkpoint: stage.checkpoint,
  };
}

function newStageDraft(orderIndex: number): DraftStage {
  return {
    uid: `new_${Math.random().toString(16).slice(2)}`,
    order_index: orderIndex,
    label: `Stage ${orderIndex}`,
    prompt_md: "",
    checkpoint: false,
  };
}

export default function AssistantEditor(props: AssistantEditorProps) {
  const { theme, onBack } = props;
  const c = ddTheme(theme);
  const isEdit = props.mode === "edit";
  const isReadOnly = isEdit && props.workflow.is_builtin;

  const [name, setName] = useState(isEdit ? props.workflow.name : "Untitled Assistant Workflow");
  const [description, setDescription] = useState(isEdit ? props.workflow.description : "");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(
    isEdit ? props.workflow.output_format : "word"
  );
  const [stages, setStages] = useState<DraftStage[]>(() => {
    if (isEdit && props.workflow.stages.length > 0) {
      return props.workflow.stages.map(stageToDraft);
    }
    return [newStageDraft(1)];
  });
  const [activeStageUid, setActiveStageUid] = useState<string>(() =>
    isEdit && props.workflow.stages.length > 0 ? props.workflow.stages[0].id : ""
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeStageUid && stages.length > 0) setActiveStageUid(stages[0].uid);
  }, [stages, activeStageUid]);

  // Reload local state when the workflow prop changes (after a successful save).
  useEffect(() => {
    if (props.mode !== "edit") return;
    setName(props.workflow.name);
    setDescription(props.workflow.description);
    setOutputFormat(props.workflow.output_format);
    setStages(
      props.workflow.stages.length > 0
        ? props.workflow.stages.map(stageToDraft)
        : [newStageDraft(1)]
    );
    // Keep active selection if still present, else default to first.
    setActiveStageUid((prev) => {
      if (props.workflow.stages.find((s) => s.id === prev)) return prev;
      return props.workflow.stages[0]?.id ?? "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit ? props.workflow.updated_at : null]);

  const activeStage = useMemo(
    () => stages.find((s) => s.uid === activeStageUid) ?? stages[0],
    [stages, activeStageUid]
  );

  function patchActiveStage(patch: Partial<DraftStage>) {
    if (isReadOnly) return;
    setStages((prev) =>
      prev.map((s) => (s.uid === activeStage.uid ? { ...s, ...patch } : s))
    );
  }

  function addStage() {
    if (isReadOnly) return;
    setStages((prev) => {
      const next = newStageDraft(prev.length + 1);
      const updated = [...prev, next];
      setActiveStageUid(next.uid);
      return updated;
    });
  }

  function removeStage(uid: string) {
    if (isReadOnly || stages.length <= 1) return;
    setStages((prev) => {
      const filtered = prev
        .filter((s) => s.uid !== uid)
        .map((s, idx) => ({ ...s, order_index: idx + 1 }));
      if (activeStageUid === uid) setActiveStageUid(filtered[0]?.uid ?? "");
      return filtered;
    });
  }

  function moveStage(uid: string, dir: -1 | 1) {
    if (isReadOnly) return;
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.uid === uid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order_index: i + 1 }));
    });
  }

  async function handleSave() {
    if (isReadOnly || saving) return;
    const stagesPayload: WorkflowStageInput[] = stages.map((s) => ({
      id: s.id,
      order_index: s.order_index,
      label: s.label.trim() || `Stage ${s.order_index}`,
      prompt_md: s.prompt_md,
      checkpoint: s.checkpoint,
    }));
    setSaving(true);
    setSaveMessage(null);
    try {
      if (props.mode === "create") {
        await props.onCreate({
          name: name.trim() || "Untitled Assistant Workflow",
          description,
          type: "assistant",
          output_format: outputFormat,
          stages: stagesPayload,
        });
        setSaveMessage("Created");
      } else {
        await props.onSave({
          name: name.trim() || "Untitled Assistant Workflow",
          description,
          output_format: outputFormat,
          stages: stagesPayload,
        });
        setSaveMessage("Saved");
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 2400);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        background: c.bg,
        color: c.t1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: `1px solid ${c.border}`,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <button
            onClick={onBack}
            style={{
              padding: "5px 10px",
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 7,
              color: c.t2,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← Library
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              value={name}
              disabled={isReadOnly}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: c.t1,
                fontSize: 18,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            />
            <input
              value={description}
              disabled={isReadOnly}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line description"
              style={{
                width: "100%",
                marginTop: 2,
                background: "transparent",
                border: "none",
                outline: "none",
                color: c.t2,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isReadOnly && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 4,
                background: c.surfaceAlt,
                border: `1px solid ${c.border}`,
                color: c.t3,
              }}
            >
              Built-in · Read only
            </span>
          )}
          {saveMessage && (
            <span style={{ fontSize: 11, color: c.t2 }}>{saveMessage}</span>
          )}
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "6px 14px",
                background: ACCENT,
                color: "white",
                border: "none",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Create"}
            </button>
          )}
          {props.mode === "edit" && props.onDelete && !isReadOnly && (
            <button
              onClick={() => {
                if (confirm("Delete this workflow? This cannot be undone.")) props.onDelete?.();
              }}
              style={{
                padding: "6px 12px",
                background: "transparent",
                color: "#ef4444",
                border: `1px solid ${c.border}`,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "220px 1fr 280px",
          minHeight: 0,
        }}
      >
        {/* Left rail */}
        <div
          style={{
            borderRight: `1px solid ${c.border}`,
            padding: 16,
            overflowY: "auto",
            background: c.surfaceAlt,
          }}
        >
          <SectionLabel theme={theme}>Stages</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
            {stages.map((stage, i) => (
              <StageRailItem
                key={stage.uid}
                index={i + 1}
                label={stage.label}
                checkpoint={stage.checkpoint}
                active={stage.uid === activeStageUid}
                onClick={() => setActiveStageUid(stage.uid)}
                onMoveUp={i > 0 && !isReadOnly ? () => moveStage(stage.uid, -1) : undefined}
                onMoveDown={
                  i < stages.length - 1 && !isReadOnly
                    ? () => moveStage(stage.uid, 1)
                    : undefined
                }
                onRemove={
                  stages.length > 1 && !isReadOnly ? () => removeStage(stage.uid) : undefined
                }
                theme={theme}
              />
            ))}
          </div>
          {!isReadOnly && (
            <button
              onClick={addStage}
              style={{
                width: "100%",
                padding: "7px 10px",
                background: "transparent",
                border: `1px dashed ${c.border}`,
                color: c.t2,
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add stage
            </button>
          )}

          <div style={{ marginTop: 24 }}>
            <SectionLabel theme={theme}>Settings</SectionLabel>
            <div style={{ fontSize: 11, color: c.t3, marginBottom: 6 }}>Output format</div>
            <div
              style={{
                display: "flex",
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 7,
                padding: 2,
                gap: 2,
              }}
            >
              {(["word", "markdown", "excel"] as OutputFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => !isReadOnly && setOutputFormat(fmt)}
                  disabled={isReadOnly}
                  style={{
                    flex: 1,
                    padding: "5px 6px",
                    background: outputFormat === fmt ? ACCENT : "transparent",
                    color: outputFormat === fmt ? "white" : c.t2,
                    border: "none",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    cursor: isReadOnly ? "not-allowed" : "pointer",
                  }}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center: prompt editor */}
        <div
          style={{
            padding: 24,
            overflowY: "auto",
          }}
        >
          {activeStage ? (
            <>
              <input
                value={activeStage.label}
                disabled={isReadOnly}
                onChange={(e) => patchActiveStage({ label: e.target.value })}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: c.t1,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  marginBottom: 4,
                }}
              />
              <div style={{ fontSize: 12, color: c.t2, marginBottom: 16 }}>
                Stage {activeStage.order_index} of {stages.length} ·{" "}
                {activeStage.checkpoint
                  ? "Pauses for analyst review before next stage"
                  : "Runs automatically into next stage"}
              </div>

              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: c.t3,
                  marginBottom: 6,
                }}
              >
                System Prompt
              </div>
              <textarea
                value={activeStage.prompt_md}
                disabled={isReadOnly}
                onChange={(e) => patchActiveStage({ prompt_md: e.target.value })}
                placeholder="Write the system prompt for this stage. Use {variables} for placeholders that get filled at run time."
                style={{
                  width: "100%",
                  minHeight: 280,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  padding: 16,
                  color: c.t1,
                  fontSize: 12,
                  fontFamily: "'DM Mono', monospace",
                  lineHeight: 1.6,
                  outline: "none",
                  resize: "vertical",
                }}
              />

              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <ToggleSwitch
                  on={activeStage.checkpoint}
                  onChange={(v) => patchActiveStage({ checkpoint: v })}
                  disabled={isReadOnly}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    Checkpoint before next stage
                  </div>
                  <div style={{ fontSize: 11, color: c.t2, marginTop: 2 }}>
                    When on, the run pauses after this stage so an analyst can review and
                    edit the output before continuing.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: c.t2 }}>Select a stage to edit.</div>
          )}
        </div>

        {/* Right: flow preview */}
        <div
          style={{
            borderLeft: `1px solid ${c.border}`,
            padding: 20,
            background: c.surfaceAlt,
            overflowY: "auto",
          }}
        >
          <SectionLabel theme={theme}>Flow</SectionLabel>
          <FlowStep label="Upload docs" theme={theme} />
          {stages.flatMap((stage, i) => {
            const items = [
              <FlowConnector key={`con-pre-${stage.uid}`} theme={theme} />,
              <FlowStep
                key={`step-${stage.uid}`}
                label={stage.label || `Stage ${i + 1}`}
                active={stage.uid === activeStageUid}
                theme={theme}
              />,
            ];
            if (stage.checkpoint && i < stages.length - 1) {
              items.push(
                <FlowConnector key={`con-post-${stage.uid}`} theme={theme} />,
                <FlowStep
                  key={`cp-${stage.uid}`}
                  label="Checkpoint"
                  badge
                  theme={theme}
                />
              );
            }
            return items;
          })}
          <FlowConnector theme={theme} />
          <FlowStep label={`Output (${outputFormat})`} theme={theme} />

          <div style={{ marginTop: 28 }}>
            <SectionLabel theme={theme}>Test context</SectionLabel>
            <div
              style={{
                fontSize: 11,
                color: c.t2,
                lineHeight: 1.6,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                padding: 12,
              }}
            >
              Document selection happens at run time. Phase 1 ships authoring only —
              the Run experience lands in the next phase.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: c.t3,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function StageRailItem({
  index,
  label,
  checkpoint,
  active,
  onClick,
  onMoveUp,
  onMoveDown,
  onRemove,
  theme,
}: {
  index: number;
  label: string;
  checkpoint: boolean;
  active: boolean;
  onClick: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 10px",
        background: active ? c.surface : "transparent",
        border: `1px solid ${active ? c.border : "transparent"}`,
        borderRadius: 7,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: active ? ACCENT : "transparent",
          border: `1px solid ${active ? ACCENT : c.border}`,
          color: active ? "white" : c.t2,
          fontSize: 11,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {index}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: active ? 600 : 500,
            color: c.t1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label || `Stage ${index}`}
        </div>
        {checkpoint && (
          <div style={{ fontSize: 10, color: AMBER, marginTop: 1 }}>● Checkpoint</div>
        )}
      </div>
      {(onMoveUp || onMoveDown || onRemove) && active && (
        <div style={{ display: "flex", gap: 2 }}>
          {onMoveUp && (
            <RailIconButton onClick={onMoveUp} title="Move up" theme={theme}>
              ↑
            </RailIconButton>
          )}
          {onMoveDown && (
            <RailIconButton onClick={onMoveDown} title="Move down" theme={theme}>
              ↓
            </RailIconButton>
          )}
          {onRemove && (
            <RailIconButton onClick={onRemove} title="Remove" theme={theme}>
              ×
            </RailIconButton>
          )}
        </div>
      )}
    </div>
  );
}

function RailIconButton({
  onClick,
  title,
  children,
  theme,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        width: 18,
        height: 18,
        background: "transparent",
        border: "none",
        color: c.t2,
        fontSize: 12,
        cursor: "pointer",
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}

function ToggleSwitch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        width: 36,
        height: 20,
        background: on ? ACCENT : "#475569",
        borderRadius: 99,
        border: "none",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          background: "white",
          borderRadius: "50%",
          transition: "left .15s",
        }}
      />
    </button>
  );
}

function FlowStep({
  label,
  active,
  badge,
  theme,
}: {
  label: string;
  active?: boolean;
  badge?: boolean;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        padding: "8px 10px",
        background: active ? c.surface : badge ? "transparent" : c.surface,
        border: `1px solid ${active ? ACCENT : badge ? AMBER : c.border}`,
        borderRadius: 8,
        fontSize: 11,
        fontWeight: badge ? 600 : 500,
        color: badge ? AMBER : c.t1,
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

function FlowConnector({ theme }: { theme: Theme }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        width: 1,
        height: 12,
        background: c.border,
        margin: "0 auto",
      }}
    />
  );
}
