import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  onSave,
}: {
  column: WorkflowColumn;
  onSave: (patch: ColumnDraft) => Promise<void> | void;
}) {
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
        className="opacity-50 group-hover/header:opacity-100 transition-opacity text-t2"
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
            className="bg-surface border border-edge text-t1"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: "min(460px, calc(100vw - 32px))",
              maxHeight: pos.maxHeight,
              overflowY: "auto",
              borderRadius: 12,
              boxShadow: "0 16px 40px rgba(15,23,42,0.25)",
              zIndex: 9999,
              fontSize: 12,
            }}
          >
            <div
              className="border-b border-b-edge bg-surface"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <div style={{ fontWeight: 600 }}>Edit column</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-t2"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <Field label="Label">
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
                  className={inputClass}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 12 }}>
                <Field label="Answer shape">
                  <ShapePicker
                    value={draft.format}
                    onChange={(format) =>
                      updateDraft({
                        format,
                        tags: format === "enum" ? draft.tags : [],
                      })
                    }
                  />
                  {autoDetectedShape && autoDetectedShape.value !== draft.format && (
                    <div className="text-[10px] text-t3 mt-[7px] leading-[1.45]">
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
                <Field label="Preset">
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
                    className={inputClass}
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
                <Field label="Shape options" style={{ marginTop: 12 }}>
                  <ShapeOptionsInspector
                    format={draft.format}
                    tags={draft.tags}
                    onTagsChange={(tags) => updateDraft({ tags })}
                  />
                </Field>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span className="text-[10px] font-semibold text-t3 uppercase tracking-[0.06em]">
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
                className={`${inputClass} mt-1 resize-none leading-[1.55]`}
                style={{ fontFamily: "inherit" }}
              />
              <div style={{ marginTop: 12 }}>
                <Field label="Cell preview">
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
                  />
                </Field>
              </div>
            </div>
            <div
              className="border-t border-t-edge bg-surface"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "12px 16px",
                position: "sticky",
                bottom: 0,
              }}
            >
              <button
                onClick={() => setOpen(false)}
                className="border border-edge text-t2"
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  background: "transparent",
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
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "block", ...style }}>
      <div className="text-[10px] font-semibold text-t3 uppercase tracking-[0.06em] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

/** Shared text-input chrome for this menu's fields. */
const inputClass =
  "w-full px-2 py-1.5 border border-edge rounded-md bg-appbg text-t1 text-xs outline-none";
