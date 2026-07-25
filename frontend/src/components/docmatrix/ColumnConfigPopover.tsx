import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FORMAT_OPTIONS,
  PE_COLUMN_PRESETS,
  TAG_COLORS,
  buildFallbackPrompt,
  getPresetConfig,
  type ColumnFormat,
  type MatrixColumnConfig,
} from "@/lib/matrixColumnConfig";
import Button from "@/components/ui/Button";

interface ColumnDraft {
  label: string;
  prompt: string;
  format: ColumnFormat;
  tags: string[];
}

// The per-column "⋮" edit popover: label, format, preset, tags, prompt. Portaled
// to body and positioned relative to its trigger button.
export default function ColumnConfigPopover({
  column,
  disabled,
  onSave,
  onDelete,
}: {
  column: MatrixColumnConfig;
  disabled?: boolean;
  onSave: (column: MatrixColumnConfig) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnDraft>({
    label: column.label,
    prompt: column.prompt,
    format: column.format,
    tags: column.tags || [],
  });
  const [tagInput, setTagInput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, maxHeight: 560 });

  useEffect(() => {
    if (!open) {
      setDraft({
        label: column.label,
        prompt: column.prompt,
        format: column.format,
        tags: column.tags || [],
      });
      setTagInput("");
    }
  }, [column, open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 460;
      const gap = 8;
      const top = Math.min(rect.bottom + gap, window.innerHeight - 120);
      const left = Math.min(
        Math.max(16, rect.right - width),
        Math.max(16, window.innerWidth - width - 16)
      );
      setPanelPos({
        top,
        left,
        maxHeight: Math.max(320, window.innerHeight - top - 16),
      });
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

  function applyPreset(name: string) {
    const preset = PE_COLUMN_PRESETS.find((item) => item.name === name);
    if (!preset) return;
    updateDraft({
      label: preset.name,
      prompt: preset.prompt,
      format: preset.format,
      tags: preset.tags || [],
    });
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

  function commitTag() {
    const tag = tagInput.trim();
    if (!tag) {
      setTagInput("");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags : [...prev.tags, tag],
    }));
    setTagInput("");
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTag();
      return;
    }
    if (event.key === "Backspace" && tagInput === "" && draft.tags.length > 0) {
      updateDraft({ tags: draft.tags.slice(0, -1) });
    }
  }

  function handleSave() {
    const label = draft.label.trim();
    const prompt = draft.prompt.trim();
    if (!label || !prompt) return;
    onSave({
      ...column,
      label,
      prompt,
      format: draft.format,
      tags: draft.format === "tag" ? draft.tags : undefined,
    });
    setOpen(false);
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="p-0.5 text-t1 hover:text-blue-600 dark:hover:text-blue-400 rounded disabled:opacity-30"
        data-open={open}
        title="Edit label, prompt, and format"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6h.01M12 12h.01M12 18h.01" />
        </svg>
      </button>

      {open &&
        createPortal(
        <div
          ref={panelRef}
          className="fixed z-[9999] rounded-xl border border-edge bg-surface shadow-2xl"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: "min(460px, calc(100vw - 32px))",
            maxHeight: panelPos.maxHeight,
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 mb-1 flex items-center justify-between border-b border-edge-light bg-surface px-4 py-3">
            <div className="text-sm font-semibold text-t1">Edit column</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-t3 hover:bg-grid-header hover:text-t2"
              aria-label="Close column editor"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-4 py-3">
          <label className="text-xs font-medium text-t2">Label</label>
          <input
            value={draft.label}
            onChange={(event) => {
              const label = event.target.value;
              const preset = getPresetConfig(label);
              updateDraft({
                label,
                ...(preset
                  ? { prompt: preset.prompt, format: preset.format, tags: preset.tags || [] }
                  : {}),
              });
            }}
            className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs text-t1 focus:border-focus focus:outline-none"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-t2">Format</label>
              <select
                value={draft.format}
                onChange={(event) =>
                  updateDraft({
                    format: event.target.value as ColumnFormat,
                    tags: event.target.value === "tag" ? draft.tags : [],
                  })
                }
                className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs text-t1 focus:border-focus focus:outline-none"
              >
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-t2">Preset</label>
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) applyPreset(event.target.value);
                }}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs text-t1 focus:border-focus focus:outline-none"
              >
                <option value="">Choose...</option>
                {PE_COLUMN_PRESETS.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {draft.format === "tag" && (
            <div className="mt-3">
              <label className="text-xs font-medium text-t2">Tags</label>
              <div className="mt-1 flex min-h-[32px] flex-wrap gap-1 rounded-md border border-edge px-2 py-1.5">
                {draft.tags.map((tag, tagIdx) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${TAG_COLORS[tagIdx % TAG_COLORS.length]}`}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => updateDraft({ tags: draft.tags.filter((item) => item !== tag) })}
                      className="text-current opacity-60 hover:opacity-100"
                    >
                      x
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={commitTag}
                  placeholder={draft.tags.length === 0 ? "Add tag..." : ""}
                  className="min-w-[70px] flex-1 bg-transparent text-xs text-t1 outline-none placeholder:text-t3"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <label className="text-xs font-medium text-t2">Prompt</label>
            <button
              type="button"
              onClick={autoGeneratePrompt}
              disabled={!draft.label.trim()}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:text-t4 dark:text-blue-400"
            >
              Auto-generate
            </button>
          </div>
          <textarea
            rows={8}
            value={draft.prompt}
            onChange={(event) => updateDraft({ prompt: event.target.value })}
            className="mt-1 w-full resize-none rounded-md border border-edge bg-surface px-2 py-2 text-xs leading-relaxed text-t1 focus:border-focus focus:outline-none"
          />
          </div>

          <div className="sticky bottom-0 flex items-center justify-between border-t border-edge-light bg-surface px-4 py-3">
            <Button
              variant="danger"
              size="xs"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Delete
            </Button>
            <Button
              variant="primary"
              size="xs"
              disabled={!draft.label.trim() || !draft.prompt.trim()}
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </div>
        , document.body)}
    </div>
  );
}
