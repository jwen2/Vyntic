import { memo, useMemo, useState } from "react";
import { Citation } from "@/lib/api";
import { fixMarkdownTables } from "@/lib/markdownUtils";
import AnswerText, { CitBadge } from "@/components/dd/AnswerText";
import { getPillClass, type MatrixColumnConfig } from "@/lib/matrixColumnConfig";
import type { DocResult } from "./useDocMatrix";

// ── Helpers ──

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function citationId(citation: Citation, index: number) {
  return `${citation.source_file}_p${citation.page}_${index}`;
}

function isPillOnlyAnswer(text: string): boolean {
  const stripped = text.trim();
  if (!stripped || stripped.includes("page:")) return false;
  return /^(\[\[[^\]]+\]\]\s*)+$/.test(stripped);
}

function extractPills(text: string): string[] {
  const pills: string[] = [];
  const pattern = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const content = match[1];
    if (!content.startsWith("page:")) pills.push(content);
  }
  return pills;
}

function RetryIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v6h6M20 20v-6h-6M5.07 9A8 8 0 0119.93 9M18.93 15A8 8 0 014.07 15"
      />
    </svg>
  );
}

// ── Matrix Cell for Doc Matrix ──

function DocMatrixCellImpl({
  cell,
  column,
  activeCitationId,
  onCitationClick,
  onRetry,
}: {
  cell: DocResult | undefined;
  column?: MatrixColumnConfig;
  dealId: string;
  activeCitationId: string | null;
  onCitationClick: (citation: Citation, id: string) => void;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const cleanAnswer = useMemo(
    () => (cell?.answer ? fixMarkdownTables(stripThinkTags(cell.answer)) : ""),
    [cell?.answer]
  );

  const citations = cell?.citations || [];
  const nonNullCitations = citations.filter((c): c is Citation => c !== null);
  const pillValues = column ? extractPills(cleanAnswer) : [];
  const showPillSummary = !!column && isPillOnlyAnswer(cleanAnswer) && pillValues.length > 0;

  if (!cell || cell.status === "idle") {
    return (
      <td className="p-3 text-t3 text-sm border-b border-b-edge-light transition-colors group-hover:bg-[var(--accent-tint)]">
        &mdash;
      </td>
    );
  }

  // Loading with no content yet
  if (cell.status === "loading" && cleanAnswer.length === 0) {
    return (
      <td className="p-3 border-b border-b-edge-light transition-colors group-hover:bg-[var(--accent-tint)]">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-xs text-t3">Analyzing...</span>
        </div>
      </td>
    );
  }

  // Loading with streaming content (think tags hidden)
  if (cell.status === "loading" && cleanAnswer.length > 0) {
    if (!cleanAnswer) {
      return (
        <td className="p-3 border-b border-b-edge-light text-sm align-top max-w-xs transition-colors group-hover:bg-[var(--accent-tint)]">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <div className="animate-pulse text-xs">Reasoning...</div>
          </div>
        </td>
      );
    }
    return (
      <td className="p-3 border-b border-b-edge-light text-sm align-top max-w-xs transition-colors group-hover:bg-[var(--accent-tint)]">
        <div className="max-w-none text-t1 line-clamp-6">
          <AnswerText
            text={cleanAnswer}
            citations={citations}
            activeCitId={activeCitationId}
            onCit={onCitationClick}
          />
        </div>
        <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      </td>
    );
  }

  // Error
  if (cell.status === "error") {
    return (
      <td className="p-3 border-b border-b-edge-light bg-red-50 dark:bg-red-950/30 text-sm align-top group">
        <div className="flex items-start justify-between gap-2">
          <div className="text-red-700 dark:text-red-400 flex-1 min-w-0">
            {cell.answer}
          </div>
          <button
            onClick={onRetry}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-red-300 dark:border-red-800 bg-surface dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            title="Re-run this question for this document"
          >
            <RetryIcon />
            Retry
          </button>
        </div>
      </td>
    );
  }

  // Complete
  const clampClass = expanded ? "" : "line-clamp-4";
  return (
    <td className="p-3 border-b border-b-edge-light text-sm max-w-xs align-top group relative transition-colors group-hover:bg-[var(--accent-tint)]">
      <button
        onClick={onRetry}
        className="absolute top-1.5 right-1.5 z-[1] inline-flex items-center justify-center w-6 h-6 rounded text-t3 hover:text-[var(--accent)] hover:bg-[var(--accent-tint)] opacity-0 group-hover:opacity-100 transition-opacity"
        title="Re-run this question for this document"
        aria-label="Retry this cell"
      >
        <RetryIcon />
      </button>

      {showPillSummary ? (
        <div className="flex flex-wrap gap-1.5 pr-6">
          {pillValues.map((pill) => (
            <span
              key={pill}
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getPillClass(pill, column)}`}
            >
              {pill}
            </span>
          ))}
        </div>
      ) : (
        <div
          className={`max-w-none text-t1 ${clampClass}`}
        >
          <AnswerText
            text={cleanAnswer}
            citations={citations}
            activeCitId={activeCitationId}
            onCit={onCitationClick}
          />
        </div>
      )}

      {nonNullCitations.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {nonNullCitations.map((citation, index) => {
            const id = citationId(citation, index);
            return (
              <CitBadge
                key={id}
                cit={citation}
                id={id}
                active={activeCitationId === id}
                onClick={() => onCitationClick(citation, id)}
              />
            );
          })}
        </div>
      )}

      {/* Expand toggle */}
      {cleanAnswer.length > 200 && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-[var(--accent)] px-1.5 py-0.5 rounded hover:bg-[var(--accent-tint)] transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}

      {/* Model info — dev metadata, revealed on row hover only */}
      {cell.model && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-t3 opacity-0 transition-opacity group-hover:opacity-100">
          <span
            className={`px-1.5 py-0.5 rounded-full font-mono ${
              cell.fallback
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                : "bg-grid-header text-t2"
            }`}
          >
            {cell.model}
          </span>
          {cell.fallback && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">fallback</span>
          )}
          {cell.duration_ms != null && (
            <span>{(cell.duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </td>
  );
}

const DocMatrixCell = memo(DocMatrixCellImpl);
export default DocMatrixCell;
