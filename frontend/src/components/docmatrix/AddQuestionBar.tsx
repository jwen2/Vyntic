import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QUERY_TEMPLATES } from "@/lib/queryTemplates";
import {
  PE_COLUMN_PRESETS,
  getFormatShort,
  type ColumnFormat,
} from "@/lib/matrixColumnConfig";
import Button from "@/components/ui/Button";

interface Props {
  onAddQuery: (text: string) => void;
  onAddTemplate: (label: string, prompt?: string, format?: ColumnFormat, tags?: string[]) => void;
  loading: boolean;
}

/**
 * Persistent "ask a question → add a column" bar, docked above the grid.
 * Lifted out of the table header so it is always visible and never scrolls
 * off-screen behind wide columns. Echoes the empty-state ask hero.
 */
export default function AddQuestionBar({ onAddQuery, onAddTemplate, loading }: Props) {
  const [newQuery, setNewQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);
  const templateBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const handleAddQuery = () => {
    if (newQuery.trim()) {
      onAddQuery(newQuery.trim());
      setNewQuery("");
    }
  };

  const handleTemplateSelect = (
    label: string,
    prompt?: string,
    format?: ColumnFormat,
    tags?: string[]
  ) => {
    onAddTemplate(label, prompt, format, tags);
    setShowTemplates(false);
  };

  // Position and close the template dropdown
  useEffect(() => {
    if (!showTemplates) return;
    if (templateBtnRef.current) {
      const rect = templateBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 384) });
    }
    const handler = (e: MouseEvent) => {
      if (
        templateRef.current &&
        !templateRef.current.contains(e.target as Node) &&
        templateBtnRef.current &&
        !templateBtnRef.current.contains(e.target as Node)
      ) {
        setShowTemplates(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplates]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2">
      <svg
        className="h-4 w-4 flex-shrink-0 text-t3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 10.5h8M8 14h5m-8.5 6 3-2H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14Z" />
      </svg>
      <input
        type="text"
        value={newQuery}
        onChange={(e) => setNewQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAddQuery()}
        placeholder="Ask a question to add a column across all documents…"
        className="min-w-0 flex-1 bg-transparent text-t1 placeholder:text-t3 focus:outline-none"
        style={{ font: "var(--text-sm)" }}
        disabled={loading}
      />

      <Button
        ref={templateBtnRef}
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => setShowTemplates((v) => !v)}
        title="Question templates"
        style={{ flexShrink: 0 }}
        iconLeft={
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        }
      >
        Templates
      </Button>

      <Button
        variant="primary"
        size="sm"
        disabled={loading || !newQuery.trim()}
        onClick={handleAddQuery}
        style={{ flexShrink: 0 }}
        iconLeft={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        }
      >
        Add column
      </Button>

      {showTemplates &&
        createPortal(
          <div
            ref={templateRef}
            className="fixed z-[9999] max-h-[480px] w-96 overflow-y-auto rounded-lg border border-edge bg-surface shadow-2xl"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <div className="sticky top-0 z-10 border-b border-edge-light bg-surface p-2.5">
              <span className="font-semibold uppercase tracking-wide text-t3" style={{ font: "var(--text-xs)" }}>
                Column Templates
              </span>
            </div>
            <div>
              <div className="sticky top-10 z-[2] flex items-center gap-1.5 border-b border-edge bg-grid-header px-3 py-1.5 font-semibold text-t2" style={{ font: "var(--text-xs)" }}>
                <span>PE</span>
                Diligence columns
              </div>
              {PE_COLUMN_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() =>
                    handleTemplateSelect(preset.name, preset.prompt, preset.format, preset.tags)
                  }
                  className="w-full border-b border-edge-light px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-[var(--accent-tint)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-t1" style={{ font: "var(--text-sm)" }}>{preset.name}</span>
                    <span className="rounded bg-grid-header px-1.5 py-0.5 text-t2" style={{ font: "var(--text-2xs)" }}>
                      {getFormatShort(preset.format)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-t3" style={{ font: "var(--text-xs)" }}>{preset.prompt}</div>
                </button>
              ))}
            </div>
            {QUERY_TEMPLATES.map((cat) => (
              <div key={cat.name}>
                <div className="sticky top-10 z-[2] flex items-center gap-1.5 border-b border-edge bg-grid-header px-3 py-1.5 font-semibold text-t2" style={{ font: "var(--text-xs)" }}>
                  <span>{cat.icon}</span>
                  {cat.name}
                </div>
                {cat.templates.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => handleTemplateSelect(t.label, t.query)}
                    className="w-full border-b border-edge-light px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-[var(--accent-tint)]"
                  >
                    <div className="font-medium text-t1" style={{ font: "var(--text-sm)" }}>{t.label}</div>
                    <div className="mt-0.5 text-t3" style={{ font: "var(--text-xs)" }}>{t.query}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
