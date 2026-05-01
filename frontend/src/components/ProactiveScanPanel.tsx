"use client";
import { useState, useCallback, useRef, useMemo, useEffect, Children, isValidElement, cloneElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Citation, SweepEvent, WorkstreamEvent, sweepStream } from "@/lib/api";
import { Workstream } from "@/lib/queryTemplates";
import { fixMarkdownTables } from "@/lib/markdownUtils";
import { useTableState } from "@/lib/useTableState";
import InlineCitation from "./InlineCitation";
import { QuestionResult } from "./WorkstreamPanel";

const SOURCE_PATTERN = /\[Source\s+(\d+)\]/g;

function renderTextWithCitations(
  text: string,
  citations: (Citation | null)[],
  onViewDocument?: (citation: Citation) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(SOURCE_PATTERN);

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const idx = parseInt(match[1], 10);
    parts.push(
      <InlineCitation
        key={`src-${match.index}`}
        index={idx}
        citation={citations[idx - 1]}
        onViewDocument={onViewDocument}
      />
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function processCitations(
  children: React.ReactNode,
  citations: (Citation | null)[],
  onViewDocument?: (citation: Citation) => void
): React.ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      if (new RegExp(SOURCE_PATTERN).test(child)) {
        return <>{renderTextWithCitations(child, citations, onViewDocument)}</>;
      }
      return child;
    }
    if (isValidElement(child) && child.props && (child.props as Record<string, unknown>).children) {
      const nested = (child.props as Record<string, unknown>).children as React.ReactNode;
      const processed = processCitations(nested, citations, onViewDocument);
      return cloneElement(child, {}, processed);
    }
    return child;
  });
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Count severity occurrences in answer text */
function countSeverities(results: Record<string, QuestionResult>): {
  dealBreaker: number;
  material: number;
  noteworthy: number;
} {
  let dealBreaker = 0;
  let material = 0;
  let noteworthy = 0;

  for (const r of Object.values(results)) {
    if (r.status !== "complete" || !r.answer) continue;
    const text = r.answer.toUpperCase();
    dealBreaker += (text.match(/\[DEAL-BREAKER\]/g) || []).length;
    material += (text.match(/\[MATERIAL\]/g) || []).length;
    noteworthy += (text.match(/\[NOTEWORTHY\]/g) || []).length;
  }
  return { dealBreaker, material, noteworthy };
}

interface Props {
  dealId: string;
  workstream: Workstream;
  cachedResults: Record<string, QuestionResult>;
  onResultsChange: (results: Record<string, QuestionResult>) => void;
  onViewDocument?: (citation: Citation) => void;
  /**
   * When this number changes (and is > 0), the panel kicks off a full scan
   * automatically. Used by the agent chat to delegate "Run Proactive Scan"
   * into this tab without the user clicking the button.
   */
  autoRunSignal?: number;
}

export default function ProactiveScanPanel({
  dealId,
  workstream,
  cachedResults,
  onResultsChange,
  onViewDocument,
  autoRunSignal,
}: Props) {
  const [results, setResults] = useState<Record<string, QuestionResult>>(cachedResults);
  const [runningAll, setRunningAll] = useState(false);
  const [scanMeta, setScanMeta] = useState<{ totalChunks: number } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);

  useEffect(() => {
    setResults(cachedResults);
    resultsRef.current = cachedResults;
  }, [workstream.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateResults = useCallback(
    (updater: (prev: Record<string, QuestionResult>) => Record<string, QuestionResult>) => {
      setResults((prev) => {
        const next = updater(prev);
        resultsRef.current = next;
        onResultsChange(next);
        return next;
      });
    },
    [onResultsChange]
  );

  const completedCount = useMemo(
    () =>
      workstream.templates.filter((t) => results[t.query]?.status === "complete")
        .length,
    [workstream.templates, results]
  );

  const severities = useMemo(() => countSeverities(results), [results]);
  const totalFindings = severities.dealBreaker + severities.material + severities.noteworthy;

  const handleEvent = useCallback((event: SweepEvent) => {
    if (event.type === "sweep_meta") {
      setScanMeta({ totalChunks: event.total_chunks });
      return;
    }
    if (event.type === "sweep_done") {
      // Single batched call — model/timing applies to every scan area.
      updateResults((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key]?.status === "complete") {
            next[key] = {
              ...next[key],
              model: event.model,
              fallback: event.fallback,
              duration_ms: event.duration_ms,
            };
          }
        }
        return next;
      });
      return;
    }
    const wsEvent = event as WorkstreamEvent;
    const q = wsEvent.question;
    if (wsEvent.type === "token") {
      updateResults((prev) => ({
        ...prev,
        [q]: {
          ...prev[q],
          answer: (prev[q]?.answer || "") + wsEvent.token,
          citations: prev[q]?.citations || [],
          status: "loading",
        },
      }));
    } else if (wsEvent.type === "done") {
      updateResults((prev) => ({
        ...prev,
        [q]: {
          answer: wsEvent.answer,
          citations: wsEvent.citations,
          status: "complete",
          duration_ms: wsEvent.duration_ms,
        },
      }));
    } else if (wsEvent.type === "error") {
      updateResults((prev) => ({
        ...prev,
        [q]: {
          answer: wsEvent.error,
          citations: [],
          status: "error",
        },
      }));
    }
  }, [updateResults]);

  const runFullScan = useCallback(() => {
    controllerRef.current?.abort();

    const questions = workstream.templates.map((t) => t.query);

    updateResults((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        next[q] = { answer: "", citations: [], status: "loading" };
      }
      return next;
    });
    setRunningAll(true);
    setScanMeta(null);

    controllerRef.current = sweepStream(
      dealId,
      questions,
      handleEvent,
      () => setRunningAll(false),
      (err) => {
        console.error("Sweep stream error:", err);
        setRunningAll(false);
      }
    );
  }, [dealId, workstream, handleEvent, updateResults]);

  // Auto-run when the signal increments (used by agent chat → tab redirect).
  // Tracks the last seen signal so the initial mount doesn't trigger a run,
  // and a stale signal isn't replayed if the user re-mounts the panel.
  const lastAutoRunSignalRef = useRef<number | undefined>(autoRunSignal);
  useEffect(() => {
    if (autoRunSignal === undefined || autoRunSignal === 0) return;
    if (lastAutoRunSignalRef.current === autoRunSignal) return;
    lastAutoRunSignalRef.current = autoRunSignal;
    if (runningAll) return;
    runFullScan();
  }, [autoRunSignal, runFullScan, runningAll]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="text-xl">🔍</span>
              Proactive Scan
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Scans ALL document chunks to find what you might miss — no queries needed
            </p>
          </div>
          <div className="flex items-center gap-3">
            {completedCount > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {completedCount}/{workstream.templates.length} areas scanned
              </span>
            )}
            <button
              onClick={runFullScan}
              disabled={runningAll}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                runningAll
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }`}
            >
              {runningAll ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Scanning...
                </span>
              ) : completedCount > 0 ? (
                "Re-run Full Scan"
              ) : (
                "Run Full Scan"
              )}
            </button>
          </div>
        </div>

        {/* Scan metadata */}
        {scanMeta && (
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Scanning {scanMeta.totalChunks} document chunks across all uploaded files
          </div>
        )}

        {/* Severity summary bar */}
        {totalFindings > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {totalFindings} finding{totalFindings !== 1 ? "s" : ""}:
            </span>
            {severities.dealBreaker > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {severities.dealBreaker} Deal-Breaker
              </span>
            )}
            {severities.material > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {severities.material} Material
              </span>
            )}
            {severities.noteworthy > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {severities.noteworthy} Noteworthy
              </span>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {completedCount === 0 && !runningAll && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Find what you might miss
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              The proactive scan reads <strong>every document chunk</strong> in your deal room — not
              just what matches a query. It surfaces hidden risks, buried clauses, cross-document
              inconsistencies, and data room gaps that traditional Q&A might overlook.
            </p>
            <button
              onClick={runFullScan}
              className="px-6 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              Run Proactive Scan
            </button>
          </div>
        </div>
      )}

      {/* Scan area results */}
      {(completedCount > 0 || runningAll) && (
        <div className="flex-1 overflow-y-auto">
          {workstream.templates.map((template) => {
            const result = results[template.query];
            return (
              <ScanAreaRow
                key={template.query}
                label={template.label}
                query={template.query}
                result={result}
                onViewDocument={onViewDocument}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScanAreaRow({
  label,
  query,
  result,
  onViewDocument,
}: {
  label: string;
  query: string;
  result: QuestionResult | undefined;
  onViewDocument?: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = result && result.status !== "pending";
  const tableState = useTableState();
  const cleanAnswer = result?.answer ? fixMarkdownTables(stripThinkTags(result.answer)) : "";
  const sourceCount = result?.citations
    ? result.citations.filter((c) => c !== null).length
    : 0;

  // Count severity in this specific answer
  const findingCounts = useMemo(() => {
    if (!cleanAnswer) return { dealBreaker: 0, material: 0, noteworthy: 0 };
    const upper = cleanAnswer.toUpperCase();
    return {
      dealBreaker: (upper.match(/\[DEAL-BREAKER\]/g) || []).length,
      material: (upper.match(/\[MATERIAL\]/g) || []).length,
      noteworthy: (upper.match(/\[NOTEWORTHY\]/g) || []).length,
    };
  }, [cleanAnswer]);
  const areaTotal = findingCounts.dealBreaker + findingCounts.material + findingCounts.noteworthy;

  useEffect(() => {
    if (result?.status === "loading") setExpanded(true);
  }, [result?.status]);

  // Auto-expand when complete and has findings
  useEffect(() => {
    if (result?.status === "complete" && areaTotal > 0) setExpanded(true);
  }, [result?.status, areaTotal]);

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
          hasResult ? "bg-white dark:bg-gray-900" : ""
        }`}
        onClick={() => hasResult && setExpanded(!expanded)}
      >
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {result?.status === "complete" ? (
            findingCounts.dealBreaker > 0 ? (
              <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <span className="text-red-600 dark:text-red-400 text-xs font-bold">!</span>
              </div>
            ) : findingCounts.material > 0 ? (
              <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <span className="text-amber-600 dark:text-amber-400 text-xs font-bold">!</span>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-emerald-600 dark:text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )
          ) : result?.status === "loading" ? (
            <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          ) : result?.status === "error" ? (
            <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-xs font-bold">!</span>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-gray-700" />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">{label}</div>
        </div>

        {/* Findings badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {result?.status === "complete" && areaTotal > 0 && (
            <div className="flex items-center gap-1.5">
              {findingCounts.dealBreaker > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-medium">
                  {findingCounts.dealBreaker} deal-breaker
                </span>
              )}
              {findingCounts.material > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">
                  {findingCounts.material} material
                </span>
              )}
              {findingCounts.noteworthy > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 font-medium">
                  {findingCounts.noteworthy} noteworthy
                </span>
              )}
            </div>
          )}
          {result?.status === "complete" && areaTotal === 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-medium">
              Clear
            </span>
          )}
          {result?.status === "complete" && result.model && (
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  result.fallback
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {result.model}
              </span>
              {result.duration_ms != null && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {(result.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
          {sourceCount > 0 && result?.status === "complete" && (
            <span className="text-[10px] text-blue-500 dark:text-blue-400">
              {sourceCount} source{sourceCount > 1 ? "s" : ""}
            </span>
          )}
          {hasResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      </div>

      {/* Answer content */}
      {(expanded || result?.status === "loading") && hasResult && (
        <div className="px-4 pb-4 pl-12">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
            {result.status === "loading" && cleanAnswer.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <div className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full" />
                Scanning documents...
              </div>
            ) : (
              <>
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => (
                        <p className="my-1.5 text-sm leading-relaxed">
                          {processCitations(children, result.citations, onViewDocument)}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="my-1.5 ml-4 list-disc space-y-1 text-sm">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="my-1.5 ml-4 list-decimal space-y-1 text-sm">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-sm leading-relaxed">
                          {processCitations(children, result.citations, onViewDocument)}
                        </li>
                      ),
                      strong: ({ children }) => {
                        const text = typeof children === "string" ? children : String(children ?? "");
                        // Color severity badges
                        if (text.includes("[DEAL-BREAKER]")) {
                          return (
                            <strong className="text-red-700 dark:text-red-400 font-semibold">
                              {children}
                            </strong>
                          );
                        }
                        if (text.includes("[MATERIAL]")) {
                          return (
                            <strong className="text-amber-700 dark:text-amber-400 font-semibold">
                              {children}
                            </strong>
                          );
                        }
                        if (text.includes("[NOTEWORTHY]")) {
                          return (
                            <strong className="text-blue-700 dark:text-blue-400 font-semibold">
                              {children}
                            </strong>
                          );
                        }
                        return (
                          <strong className="font-semibold text-gray-900 dark:text-gray-100">
                            {children}
                          </strong>
                        );
                      },
                      hr: () => (
                        <hr className="my-3 border-gray-200 dark:border-gray-700" />
                      ),
                      h1: ({ children }) => (
                        <h3 className="text-base font-bold mt-3 mb-1.5 text-gray-900 dark:text-gray-100">
                          {processCitations(children, result.citations, onViewDocument)}
                        </h3>
                      ),
                      h2: ({ children }) => (
                        <h4 className="text-sm font-bold mt-2.5 mb-1 text-gray-900 dark:text-gray-100">
                          {processCitations(children, result.citations, onViewDocument)}
                        </h4>
                      ),
                      h3: ({ children }) => (
                        <h5 className="text-sm font-semibold mt-2 mb-1 text-gray-800 dark:text-gray-200">
                          {processCitations(children, result.citations, onViewDocument)}
                        </h5>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-3 border-amber-300 dark:border-amber-600 pl-3 my-2 text-sm text-gray-600 dark:text-gray-400 italic">
                          {children}
                        </blockquote>
                      ),
                      table: ({ children }) => {
                        tableState.reset();
                        return (
                          <div className="not-prose overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
                            <table className="text-xs border-collapse w-full min-w-[280px]">
                              {children}
                            </table>
                          </div>
                        );
                      },
                      thead: ({ children }) => (
                        <thead className="bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-gray-800 dark:to-gray-800/80">
                          {children}
                        </thead>
                      ),
                      th: ({ children }) => {
                        tableState.recordHeaderCol();
                        return (
                          <th className="border-b border-r border-gray-200 dark:border-gray-700 last:border-r-0 px-3 py-2.5 text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-300 break-words">
                            {children}
                          </th>
                        );
                      },
                      tr: ({ children }) => {
                        const trClass =
                          "even:bg-slate-50/40 dark:even:bg-gray-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0";
                        const rows = tableState.processRow(children);
                        if (rows === null) return <tr className={trClass}>{children}</tr>;
                        if (rows.length === 1)
                          return <tr className={trClass}>{rows[0]}</tr>;
                        return (
                          <>
                            {rows.map((cells, i) => (
                              <tr key={i} className={trClass}>
                                {cells}
                              </tr>
                            ))}
                          </>
                        );
                      },
                      td: ({ children }) => (
                        <td className="border-r border-gray-100 dark:border-gray-800 last:border-r-0 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 break-words align-top">
                          {processCitations(children, result.citations, onViewDocument)}
                        </td>
                      ),
                    }}
                  >
                    {cleanAnswer}
                  </ReactMarkdown>
                </div>
                {result.status === "loading" && (
                  <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                )}
                {/* Bottom bar */}
                {result.status === "complete" && (
                  <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3 flex-wrap">
                    {sourceCount > 0 && (
                      <span className="text-xs text-blue-500 dark:text-blue-400">
                        {sourceCount} source{sourceCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {result.model && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                            result.fallback
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {result.model}
                        </span>
                        {result.fallback && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            fallback
                          </span>
                        )}
                        {result.duration_ms != null && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {(result.duration_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
