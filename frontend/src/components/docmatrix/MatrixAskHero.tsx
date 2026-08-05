import { useState } from "react";
import { DocumentMetadata } from "@/lib/api";
import { PE_COLUMN_PRESETS, type ColumnFormat } from "@/lib/matrixColumnConfig";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toneVars } from "@/lib/badgePalette";

// Small colour cue per file type for the scope chips (muted, not the loud grid
// chips) — routed through the curated badge palette (lib/badgePalette.ts) so
// it stays theme-aware instead of a fixed literal per type.
function extDot(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return toneVars("oxblood").fg;
  if (ext === "xlsx" || ext === "xls") return toneVars("sage").fg;
  if (ext === "csv") return toneVars("slate").fg;
  return "var(--text-3)";
}

interface Props {
  documents: DocumentMetadata[];
  onAddQuery: (text: string) => void;
  onAddTemplate: (label: string, prompt?: string, format?: ColumnFormat, tags?: string[]) => void;
  /**
   * Demo mode: the ask box and preset chips are replaced by a note saying so.
   * Every one of them opens a live model query per document, which the demo has
   * no recording for — so they are removed rather than left to dead-end. The
   * note points at the two surfaces that do carry recorded work, which is what
   * keeps this an explanation instead of a wall.
   */
  demo?: boolean;
}

/**
 * The first-question hero shown before any column exists. Replaces the whole
 * matrix area (not a row-spanning cell), so it can never drift off-screen by
 * document count. Typing a question — or clicking a preset — creates the first
 * column and runs it across every document.
 */
export default function MatrixAskHero({ documents, onAddQuery, onAddTemplate, demo = false }: Props) {
  const [value, setValue] = useState("");
  const presets = PE_COLUMN_PRESETS.slice(0, 5);
  const scopeDocs = documents.slice(0, 2);
  const remaining = documents.length - scopeDocs.length;

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    onAddQuery(q);
    setValue("");
  };

  return (
    <div className="flex justify-center px-6 py-12 sm:py-16">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--accent-tint-border)] bg-[var(--accent-tint)] text-[var(--accent)]">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 10.5h8M8 14h5m-8.5 6 3-2H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14Z" />
          </svg>
        </div>

        <h2 className="text-t1" style={{ font: "var(--text-h2)" }}>
          {demo
            ? `${documents.length} document${documents.length !== 1 ? "s" : ""} loaded and indexed`
            : `Ask anything across ${documents.length} document${documents.length !== 1 ? "s" : ""}`}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-t3" style={{ font: "var(--text-sm)" }}>
          {demo
            ? "Every answer in this demo cites the exact page and snippet — never the model’s memory."
            : "Every answer cites the exact page and snippet — never the model’s memory. Your first question becomes a column you can compare across all documents."}
        </p>

        {demo ? (
          <div
            className="mx-auto mt-6 max-w-md rounded-lg border border-edge bg-surface-alt px-4 py-3.5 text-left text-t2"
            style={{ font: "var(--text-sm)" }}
          >
            <p>
              This grid runs a fresh model query per document. The demo serves recorded
              output only, so the ask box is switched off here rather than left to return
              nothing.
            </p>
            <p className="mt-2 text-t3">
              The recorded work lives in the{" "}
              <strong className="text-t2">Brightwater Capital Partners IV</strong> workspace, one
              click away under <strong className="text-t2">Analyze</strong>:{" "}
              <strong className="text-t2">Agent</strong> answers a fixed set of questions with real
              citations, and <strong className="text-t2">Workflows</strong> replays a DDQ
              gap-and-consistency scan across its documents.
            </p>
          </div>
        ) : (
          <>
            <Input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. What was FY2025 revenue and YoY growth?"
            className="mt-6 text-left"
            fieldSize="lg"
            fullWidth
            aria-label="Ask a question across all documents"
            actionRight={
              <Button
                variant="primary"
                onClick={submit}
                disabled={!value.trim()}
                style={{ flexShrink: 0 }}
                iconRight={
                  <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                }
              >
                Ask
              </Button>
            }
          />

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => onAddTemplate(preset.name, preset.prompt, preset.format, preset.tags)}
                  className="rounded-md border border-edge bg-surface px-3.5 py-2 text-sm text-t2 transition-colors hover:border-[var(--accent-tint-border)] hover:bg-[var(--accent-tint)] hover:text-t1"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-t3">
          <span className="font-mono-plex text-[10px] uppercase tracking-[0.12em]">Searching</span>
          {scopeDocs.map((doc) => (
            <span
              key={doc.doc_id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface-alt px-2.5 py-1 text-t3"
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-sm"
                style={{ background: extDot(doc.filename) }}
              />
              <span className="max-w-[140px] truncate">{doc.filename}</span>
            </span>
          ))}
          {remaining > 0 && (
            <span className="inline-flex items-center rounded-lg border border-edge bg-surface-alt px-2.5 py-1 text-t3">
              +{remaining} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
