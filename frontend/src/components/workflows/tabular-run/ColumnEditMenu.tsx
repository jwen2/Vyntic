import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ddTheme } from "@/components/dd/types";
import type { WorkflowColumn } from "@/lib/workflows";
import {
  PE_COLUMN_PRESETS,
  buildFallbackPrompt,
  getPresetConfig,
  type ColumnFormat,
} from "@/lib/matrixColumnConfig";
import { ACCENT } from "../theme";
import {
  CellRenderPreview,
  ShapeOptionsInspector,
  ShapePicker,
  detectShape,
} from "../cells/ShapeControls";
import type { Theme } from "./useTabularRun";

export interface ColumnDraft {
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags: string[];
}

// The per-column "⋮" edit popover: label, answer shape, preset, tags, prompt,
// and a live cell preview. Portaled to body, positioned off its trigger.
export default function ColumnEditMenu({
  column,
  theme,
  onSave,
}: {
  column: WorkflowColumn;
  theme: Theme;
  onSave: (patch: ColumnDraft) => Promise<void> | void;
}) {
  const c = ddTheme(theme);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ColumnDraft>({
    label: column.label,
    prompt: column.prompt,
    format: column.format,
    tags: column.tags ?? [],
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 560 });
  const autoDetectedShape = useMemo(
    () => detectShape(`${draft.label}\n${draft.prompt}`),
    [draft.label, draft.prompt]
  );

  useEffect(() => {
    if (!open) {
      setDraft({
        label: column.label,
        prompt: column.prompt,
        format: column.format,
        tags: column.tags ?? [],
      });
    }
  }, [column, open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 460;
      const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
      const left = Math.min(
        Math.max(16, rect.right - width),
        Math.max(16, window.innerWidth - width - 16)
      );
      setPos({ top, left, maxHeight: Math.max(320, window.innerHeight - top - 16) });
    };
    updatePosition();
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function updateDraft(patch: Partial<ColumnDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function autoGeneratePrompt() {
    const label = draft.label.trim();
    if (!label) return;
    const preset = getPresetConfig(label);
    updateDraft({
      prompt: preset?.prompt || buildFallbackPrompt(label, draft.format, draft.tags),
      format: preset?.format || draft.format,
      tags: preset?.tags || draft.tags,
    });
  }

  async function handleSave() {
    const label = draft.label.trim();
    const prompt = draft.prompt.trim();
    if (!label || !prompt) return;
    setSaving(true);
    try {
      await onSave({ label, prompt, format: draft.format, tags: draft.tags });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="opacity-50 group-hover/header:opacity-100 transition-opacity"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: c.t2,
          cursor: "pointer",
          padding: 0,
        }}
        title="Edit column label, prompt, and format"
        aria-label="Edit column"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="6" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="12" cy="18" r="1.2" />
        </svg>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: "min(460px, calc(100vw - 32px))",
              maxHeight: pos.maxHeight,
              overflowY: "auto",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              boxShadow: "0 16px 40px rgba(15,23,42,0.25)",
              zIndex: 9999,
              color: c.t1,
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: `1px solid ${c.border}`,
                position: "sticky",
                top: 0,
                background: c.surface,
                zIndex: 1,
              }}
            >
              <div style={{ fontWeight: 600 }}>Edit column</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "transparent",
                  color: c.t2,
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <Field label="Label" theme={theme}>
                <input
                  value={draft.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    const preset = getPresetConfig(label);
                    updateDraft({
                      label,
                      ...(preset
                        ? { prompt: preset.prompt, format: preset.format, tags: preset.tags || [] }
                        : {}),
                    });
                  }}
                  style={inputStyle(c)}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 12 }}>
                <Field label="Answer shape" theme={theme}>
                  <ShapePicker
                    value={draft.format}
                    onChange={(format) =>
                      updateDraft({
                        format,
                        tags: format === "enum" ? draft.tags : [],
                      })
                    }
                    theme={theme}
                  />
                  {autoDetectedShape && autoDetectedShape.value !== draft.format && (
                    <div style={{ fontSize: 10, color: c.t3, marginTop: 7, lineHeight: 1.45 }}>
                      Suggested:{" "}
                      <button
                        type="button"
                        onClick={() => updateDraft({ format: autoDetectedShape.value })}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: autoDetectedShape.color,
                          cursor: "pointer",
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
                <Field label="Preset" theme={theme}>
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) return;
                      const preset = PE_COLUMN_PRESETS.find((p) => p.name === name);
                      if (!preset) return;
                      updateDraft({
                        label: preset.name,
                        prompt: preset.prompt,
                        format: preset.format,
                        tags: preset.tags || [],
                      });
                    }}
                    style={inputStyle(c)}
                  >
                    <option value="">Choose…</option>
                    {PE_COLUMN_PRESETS.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {(draft.format === "tag" || draft.format === "enum") && (
                <Field label="Shape options" theme={theme} style={{ marginTop: 12 }}>
                  <ShapeOptionsInspector
                    format={draft.format}
                    tags={draft.tags}
                    onTagsChange={(tags) => updateDraft({ tags })}
                    theme={theme}
                  />
                </Field>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Prompt
                </span>
                <button
                  onClick={autoGeneratePrompt}
                  disabled={!draft.label.trim()}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: ACCENT,
                    fontSize: 11,
                    cursor: draft.label.trim() ? "pointer" : "not-allowed",
                    opacity: draft.label.trim() ? 1 : 0.4,
                  }}
                >
                  Auto-generate
                </button>
              </div>
              <textarea
                rows={8}
                value={draft.prompt}
                onChange={(e) => updateDraft({ prompt: e.target.value })}
                style={{
                  ...inputStyle(c),
                  marginTop: 4,
                  resize: "none",
                  lineHeight: 1.55,
                  fontFamily: "inherit",
                }}
              />
              <div style={{ marginTop: 12 }}>
                <Field label="Cell preview" theme={theme}>
                  <CellRenderPreview
                    column={{
                      id: column.id,
                      order_index: column.order_index,
                      label: draft.label,
                      prompt: draft.prompt,
                      format: draft.format,
                      tags: draft.tags,
                      is_derived: column.is_derived,
                      formula: column.formula,
                    }}
                    theme={theme}
                  />
                </Field>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "12px 16px",
                borderTop: `1px solid ${c.border}`,
                position: "sticky",
                bottom: 0,
                background: c.surface,
              }}
            >
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "6px 12px",
                  border: `1px solid ${c.border}`,
                  borderRadius: 7,
                  background: "transparent",
                  color: c.t2,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.label.trim() || !draft.prompt.trim()}
                style={{
                  padding: "6px 14px",
                  border: "none",
                  borderRadius: 7,
                  background: ACCENT,
                  color: "var(--on-accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving || !draft.label.trim() || !draft.prompt.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Field({
  label,
  theme,
  children,
  style,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const c = ddTheme(theme);
  return (
    <label style={{ display: "block", ...style }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: c.t3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function inputStyle(c: ReturnType<typeof ddTheme>): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${c.border}`,
    borderRadius: 6,
    background: c.bg,
    color: c.t1,
    fontSize: 12,
    outline: "none",
  };
}
