
import { useEffect, useMemo, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  type ColumnFormat,
  getFormatShort,
} from "@/lib/matrixColumnConfig";
import type {
  RowSource,
  Workflow,
  WorkflowColumn,
  WorkflowColumnInput,
  WorkflowCreatePayload,
  WorkflowUpdatePayload,
} from "@/lib/workflows";
import { ACCENT, RED, VIOLET, tint } from "./theme";
import Button from "@/components/ui/Button";
import {
  CellRenderPreview,
  ShapeOptionsInspector,
  ShapePicker,
  detectShape,
} from "./cells/ShapeControls";

type Theme = "light" | "dark";

type EditorMode =
  | { mode: "create"; onCreate: (payload: WorkflowCreatePayload) => void | Promise<void> }
  | {
      mode: "edit";
      workflow: Workflow;
      onSave: (payload: WorkflowUpdatePayload) => void | Promise<void>;
      onDelete?: () => void | Promise<void>;
    };

type TabularEditorProps = EditorMode & {
  theme: Theme;
  onBack: () => void;
};

interface DraftColumn extends WorkflowColumnInput {
  uid: string;
}

function columnToDraft(column: WorkflowColumn): DraftColumn {
  return {
    uid: column.id,
    id: column.id,
    order_index: column.order_index,
    label: column.label,
    prompt: column.prompt,
    format: column.format,
    tags: column.tags ?? null,
    is_derived: column.is_derived,
    formula: column.formula ?? null,
  };
}

function newColumnDraft(orderIndex: number, isDerived = false): DraftColumn {
  return {
    uid: `new_${Math.random().toString(16).slice(2)}`,
    order_index: orderIndex,
    label: isDerived ? "Derived Column" : `Column ${orderIndex}`,
    prompt: isDerived
      ? ""
      : "Extract the relevant value from the document. Cite the supporting passage.",
    format: isDerived ? "text" : "prose",
    tags: null,
    is_derived: isDerived,
    formula: isDerived ? "" : null,
  };
}

const FORMAT_BADGE_COLOR: Record<ColumnFormat, string> = {
  metric: "#22c55e",
  bool: "#22c55e",
  enum: "#f59e0b",
  prose: ACCENT,
  list: "#f59e0b",
  kv: VIOLET,
  markdown: ACCENT,
  text: ACCENT,
  bulleted_list: ACCENT,
  number: ACCENT,
  percentage: ACCENT,
  monetary_amount: ACCENT,
  currency: ACCENT,
  yes_no: "#22c55e",
  date: ACCENT,
  tag: "#f59e0b",
};

export default function TabularEditor(props: TabularEditorProps) {
  const { theme, onBack } = props;
  const c = ddTheme(theme);
  const isEdit = props.mode === "edit";
  const isReadOnly = isEdit && props.workflow.is_builtin;

  const [name, setName] = useState(isEdit ? props.workflow.name : "Untitled Tabular Workflow");
  const [description, setDescription] = useState(isEdit ? props.workflow.description : "");
  const [rowSource, setRowSource] = useState<RowSource>(
    isEdit ? props.workflow.row_source : "one_doc_per_row"
  );
  const [columns, setColumns] = useState<DraftColumn[]>(() => {
    if (isEdit && props.workflow.columns.length > 0) {
      return props.workflow.columns.map(columnToDraft);
    }
    return [newColumnDraft(1)];
  });
  const [activeColumnUid, setActiveColumnUid] = useState<string>(() =>
    isEdit && props.workflow.columns.length > 0 ? props.workflow.columns[0].id : ""
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!activeColumnUid && columns.length > 0) setActiveColumnUid(columns[0].uid);
  }, [columns, activeColumnUid]);

  // Re-sync local state when the underlying workflow updates after save.
  useEffect(() => {
    if (props.mode !== "edit") return;
    setName(props.workflow.name);
    setDescription(props.workflow.description);
    setRowSource(props.workflow.row_source);
    setColumns(
      props.workflow.columns.length > 0
        ? props.workflow.columns.map(columnToDraft)
        : [newColumnDraft(1)]
    );
    setActiveColumnUid((prev) => {
      if (props.workflow.columns.find((c) => c.id === prev)) return prev;
      return props.workflow.columns[0]?.id ?? "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit ? props.workflow.updated_at : null]);

  const activeColumn = useMemo(
    () => columns.find((c) => c.uid === activeColumnUid) ?? columns[0],
    [columns, activeColumnUid]
  );
  const autoDetectedShape = useMemo(() => {
    if (!activeColumn || activeColumn.is_derived) return null;
    return detectShape(`${activeColumn.label}\n${activeColumn.prompt}`);
  }, [activeColumn]);

  function patchActiveColumn(patch: Partial<DraftColumn>) {
    if (isReadOnly) return;
    setColumns((prev) =>
      prev.map((cl) => (cl.uid === activeColumn.uid ? { ...cl, ...patch } : cl))
    );
  }

  function addColumn(isDerived = false) {
    if (isReadOnly) return;
    setColumns((prev) => {
      const next = newColumnDraft(prev.length + 1, isDerived);
      const updated = [...prev, next];
      setActiveColumnUid(next.uid);
      return updated;
    });
  }

  function removeColumn(uid: string) {
    if (isReadOnly || columns.length <= 1) return;
    setColumns((prev) => {
      const filtered = prev
        .filter((cl) => cl.uid !== uid)
        .map((cl, idx) => ({ ...cl, order_index: idx + 1 }));
      if (activeColumnUid === uid) setActiveColumnUid(filtered[0]?.uid ?? "");
      return filtered;
    });
  }

  function moveColumn(uid: string, dir: -1 | 1) {
    if (isReadOnly) return;
    setColumns((prev) => {
      const idx = prev.findIndex((cl) => cl.uid === uid);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((cl, i) => ({ ...cl, order_index: i + 1 }));
    });
  }

  async function handleSave() {
    if (isReadOnly || saving) return;
    const columnsPayload: WorkflowColumnInput[] = columns.map((cl) => ({
      id: cl.id,
      order_index: cl.order_index,
      label: cl.label.trim() || `Column ${cl.order_index}`,
      prompt: cl.prompt,
      format: cl.format,
      tags: cl.format === "tag" || cl.format === "enum" ? cl.tags ?? [] : null,
      is_derived: cl.is_derived,
      formula: cl.is_derived ? cl.formula ?? "" : null,
    }));
    setSaving(true);
    setSaveMessage(null);
    try {
      if (props.mode === "create") {
        await props.onCreate({
          name: name.trim() || "Untitled Tabular Workflow",
          description,
          type: "tabular",
          row_source: rowSource,
          output_format: "excel",
          columns: columnsPayload,
        });
        setSaveMessage("Created");
      } else {
        await props.onSave({
          name: name.trim() || "Untitled Tabular Workflow",
          description,
          row_source: rowSource,
          columns: columnsPayload,
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
          <Button variant="secondary" size="sm" onClick={onBack}>
            ← Library
          </Button>
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
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
                background: /fail|error/i.test(saveMessage)
                  ? tint(RED, 18)
                  : tint("#22c55e", 18),
                color: /fail|error/i.test(saveMessage) ? RED : "#16a34a",
              }}
            >
              {/fail|error/i.test(saveMessage) ? "✕" : "✓"} {saveMessage}
            </span>
          )}
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "6px 14px",
                background: VIOLET,
                color: "var(--on-violet)",
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
            <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          minHeight: 0,
        }}
      >
        {/* Left: config panel */}
        <div
          style={{
            borderRight: `1px solid ${c.border}`,
            padding: 16,
            overflowY: "auto",
            background: c.surfaceAlt,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <SectionLabel theme={theme}>Row source</SectionLabel>
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
              {(
                [
                  { v: "one_doc_per_row", label: "One doc per row" },
                  { v: "multi_doc_synthesis", label: "Multi-doc synthesis" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => !isReadOnly && setRowSource(opt.v)}
                  disabled={isReadOnly}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    background: rowSource === opt.v ? VIOLET : "transparent",
                    color: rowSource === opt.v ? "var(--on-violet)" : c.t2,
                    border: "none",
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: isReadOnly ? "not-allowed" : "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {rowSource === "multi_doc_synthesis" && (
              <div style={{ fontSize: 10, color: c.t3, marginTop: 6, lineHeight: 1.5 }}>
                Each row is a synthesis question you'll enter when you launch the
                run. The retriever pulls relevant chunks from every selected
                document, then the LLM answers each column for that question.
              </div>
            )}
          </div>

          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <SectionLabel theme={theme}>Columns</SectionLabel>
              {!isReadOnly && (
                <button
                  onClick={() => addColumn(false)}
                  style={{
                    padding: "3px 8px",
                    background: "transparent",
                    border: `1px dashed ${c.border}`,
                    borderRadius: 6,
                    color: c.t2,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add column
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {columns.filter((cl) => !cl.is_derived).map((column, i, arr) => (
                <ColumnCard
                  key={column.uid}
                  column={column}
                  active={column.uid === activeColumnUid}
                  onClick={() => setActiveColumnUid(column.uid)}
                  onMoveUp={i > 0 && !isReadOnly ? () => moveColumn(column.uid, -1) : undefined}
                  onMoveDown={
                    i < arr.length - 1 && !isReadOnly
                      ? () => moveColumn(column.uid, 1)
                      : undefined
                  }
                  onRemove={
                    columns.length > 1 && !isReadOnly
                      ? () => removeColumn(column.uid)
                      : undefined
                  }
                  theme={theme}
                />
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <SectionLabel theme={theme}>Derived columns</SectionLabel>
              {!isReadOnly && (
                <button
                  onClick={() => addColumn(true)}
                  style={{
                    padding: "3px 8px",
                    background: "transparent",
                    border: `1px dashed ${c.border}`,
                    borderRadius: 6,
                    color: c.t2,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add derived
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {columns.filter((cl) => cl.is_derived).length === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: c.t3,
                    background: c.surface,
                    border: `1px dashed ${c.border}`,
                    borderRadius: 8,
                    padding: 10,
                    lineHeight: 1.5,
                  }}
                >
                  Derived columns compute from other columns (e.g. risk tier from CoC + exclusivity)
                  using a spreadsheet-style formula referencing other column labels.
                </div>
              ) : (
                columns
                  .filter((cl) => cl.is_derived)
                  .map((column) => (
                    <ColumnCard
                      key={column.uid}
                      column={column}
                      active={column.uid === activeColumnUid}
                      onClick={() => setActiveColumnUid(column.uid)}
                      onRemove={
                        !isReadOnly ? () => removeColumn(column.uid) : undefined
                      }
                      theme={theme}
                    />
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Right: column detail + grid preview */}
        <div
          style={{
            padding: 24,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            minWidth: 0,
          }}
        >
          {activeColumn && (
            <div>
              <SectionLabel theme={theme}>
                {activeColumn.is_derived ? "Derived Column Detail" : "Column Detail"}
              </SectionLabel>
              <div
                style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <Field label="Label" theme={theme}>
                  <input
                    value={activeColumn.label}
                    disabled={isReadOnly}
                    onChange={(e) => patchActiveColumn({ label: e.target.value })}
                    style={inputStyle(c)}
                  />
                </Field>
                {!activeColumn.is_derived ? (
                  <Field label="Answer shape" theme={theme}>
                    <ShapePicker
                      value={activeColumn.format}
                      disabled={isReadOnly}
                      onChange={(format) =>
                        patchActiveColumn({
                          format,
                          tags: format === "enum" ? activeColumn.tags ?? [] : null,
                        })
                      }
                      theme={theme}
                    />
                    {autoDetectedShape && (
                      <div style={{ fontSize: 10, color: c.t3, marginTop: 7, lineHeight: 1.45 }}>
                        ↳ Auto-detected:{" "}
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => patchActiveColumn({ format: autoDetectedShape.value })}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: autoDetectedShape.color,
                            cursor: isReadOnly ? "not-allowed" : "pointer",
                            padding: 0,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {autoDetectedShape.label.toLowerCase()}
                        </button>
                        {" · "}
                        {autoDetectedShape.example}
                      </div>
                    )}
                  </Field>
                ) : (
                  <Field label="Format" theme={theme}>
                    <input value="Formula" disabled style={inputStyle(c)} />
                  </Field>
                )}
                {(activeColumn.format === "tag" || activeColumn.format === "enum") && (
                  <Field label="Shape options" theme={theme}>
                    <ShapeOptionsInspector
                      format={activeColumn.format}
                      tags={activeColumn.tags ?? []}
                      disabled={isReadOnly}
                      onTagsChange={(tags) =>
                        patchActiveColumn({
                          tags,
                        })
                      }
                      theme={theme}
                    />
                  </Field>
                )}
                {!activeColumn.is_derived ? (
                  <Field label="Extraction prompt" theme={theme}>
                    <textarea
                      value={activeColumn.prompt}
                      disabled={isReadOnly}
                      onChange={(e) => patchActiveColumn({ prompt: e.target.value })}
                      style={{ ...inputStyle(c), minHeight: 120, resize: "vertical" }}
                    />
                  </Field>
                ) : (
                  <Field label="Formula" theme={theme}>
                    <textarea
                      value={activeColumn.formula ?? ""}
                      disabled={isReadOnly}
                      onChange={(e) => patchActiveColumn({ formula: e.target.value })}
                      placeholder='= IF(CoC="No" AND Exclusivity="Yes", "High", "Low")'
                      style={{
                        ...inputStyle(c),
                        minHeight: 80,
                        resize: "vertical",
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                      }}
                    />
                  </Field>
                )}
              </div>
            </div>
          )}

          <div>
            <SectionLabel theme={theme}>Live grid preview</SectionLabel>
            <GridPreview columns={columns} theme={theme} />
            <div
              style={{
                fontSize: 10,
                color: c.t3,
                marginTop: 6,
                fontStyle: "italic",
              }}
            >
              Preview uses placeholder data. Run the workflow to populate with real
              extractions.
            </div>
          </div>
          {activeColumn && !activeColumn.is_derived && (
            <div>
              <SectionLabel theme={theme}>Selected cell preview</SectionLabel>
              <CellRenderPreview column={activeColumn} theme={theme} />
            </div>
          )}
        </div>
      </div>

      {confirmingDelete && props.mode === "edit" && (
        <ConfirmDialog
          title="Delete Workflow"
          message="Delete this workflow? This cannot be undone."
          onConfirm={() => {
            setConfirmingDelete(false);
            props.onDelete?.();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function inputStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    width: "100%",
    padding: "7px 10px",
    background: c.surfaceAlt,
    border: `1px solid ${c.border}`,
    borderRadius: 7,
    color: c.t1,
    fontSize: 12,
    outline: "none",
    fontFamily: "inherit",
  };
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

function Field({
  label,
  children,
  theme,
}: {
  label: string;
  children: React.ReactNode;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  return (
    <div>
      <div style={{ fontSize: 11, color: c.t2, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function ColumnCard({
  column,
  active,
  onClick,
  onMoveUp,
  onMoveDown,
  onRemove,
  theme,
}: {
  column: DraftColumn;
  active: boolean;
  onClick: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const badgeColor = column.is_derived ? RED : FORMAT_BADGE_COLOR[column.format] ?? ACCENT;
  const badgeLabel = column.is_derived ? "Formula" : getFormatShort(column.format);

  return (
    <div
      onClick={onClick}
      style={{
        background: active ? c.surface : c.surfaceAlt,
        border: `1px solid ${active ? VIOLET : c.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: c.t1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {column.label || "Untitled"}
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "2px 6px",
            borderRadius: 4,
            background: tint(badgeColor, 18),
            color: badgeColor,
            flexShrink: 0,
          }}
        >
          {badgeLabel}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: c.t3,
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {column.is_derived ? column.formula || "No formula yet" : column.prompt || "No prompt yet"}
      </div>
      {active && (onMoveUp || onMoveDown || onRemove) && (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {onMoveUp && (
            <SmallIconButton onClick={onMoveUp} title="Move up" theme={theme}>
              ↑
            </SmallIconButton>
          )}
          {onMoveDown && (
            <SmallIconButton onClick={onMoveDown} title="Move down" theme={theme}>
              ↓
            </SmallIconButton>
          )}
          {onRemove && (
            <SmallIconButton onClick={onRemove} title="Remove" theme={theme}>
              ×
            </SmallIconButton>
          )}
        </div>
      )}
    </div>
  );
}

function SmallIconButton({
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
        border: `1px solid ${c.border}`,
        color: c.t2,
        fontSize: 11,
        cursor: "pointer",
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}

function GridPreview({ columns, theme }: { columns: DraftColumn[]; theme: Theme }) {
  const c = ddTheme(theme);
  const sortedCols = [...columns].sort((a, b) => a.order_index - b.order_index);
  const sampleRows = ["Document A.pdf", "Document B.pdf", "Document C.pdf"];
  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        overflow: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={cellStyle(c, true)}>Document</th>
            {sortedCols.map((col) => (
              <th key={col.uid} style={cellStyle(c, true)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{col.label}</span>
                  <span
                    style={{
                      fontSize: 8,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: tint(col.is_derived ? RED : ACCENT, 15),
                      color: col.is_derived ? RED : ACCENT,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {col.is_derived ? "F" : getFormatShort(col.format)}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sampleRows.map((doc) => (
            <tr key={doc}>
              <td style={cellStyle(c)}>{doc}</td>
              {sortedCols.map((col) => (
                <td key={col.uid} style={cellStyle(c)}>
                  <div
                    style={{
                      width: "70%",
                      height: 6,
                      background: c.border,
                      borderRadius: 3,
                      opacity: 0.5,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellStyle(c: ReturnType<typeof ddTheme>, header = false): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderBottom: `1px solid ${c.border}`,
    color: header ? c.t2 : c.t1,
    fontWeight: header ? 600 : 400,
    textAlign: "left",
    whiteSpace: "nowrap",
  };
}
