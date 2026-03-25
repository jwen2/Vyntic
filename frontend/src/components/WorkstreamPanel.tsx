"use client";
import { useState, useCallback, useRef, useMemo, useEffect, Children, isValidElement, cloneElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Citation, WorkstreamEvent, workstreamStream, singleQuestionStream } from "@/lib/api";
import { Workstream } from "@/lib/queryTemplates";
import InlineCitation from "./InlineCitation";

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
    // Recurse into React elements to find [Source N] text nested inside
    // <strong>, <em>, <a>, etc.
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

/** Detect if a cell value is a delta/change value */
function isDeltaCell(text: string): "positive" | "negative" | null {
  const cleaned = text.replace(/\*+/g, "").trim();
  if (/^\+/.test(cleaned)) return "positive";
  if (/^[-\u2013]/.test(cleaned) && !/^[-\u2013:]+$/.test(cleaned)) return "negative";
  if (/\([-\u2013]/.test(cleaned)) return "negative";
  return null;
}

/** Detect if a header is a delta column */
function isDeltaHeader(text: string): boolean {
  return /\u0394|delta|change/i.test(text);
}

export interface QuestionResult {
  answer: string;
  citations: (Citation | null)[];
  status: "pending" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
}

interface Props {
  dealId: string;
  workstream: Workstream;
  /** Cached results from parent (survives tab switches) */
  cachedResults: Record<string, QuestionResult>;
  /** Notify parent whenever results change so cache stays in sync */
  onResultsChange: (results: Record<string, QuestionResult>) => void;
  /** Callback to open document viewer for a citation */
  onViewDocument?: (citation: Citation) => void;
}

export default function WorkstreamPanel({
  dealId,
  workstream,
  cachedResults,
  onResultsChange,
  onViewDocument,
}: Props) {
  const [results, setResults] = useState<Record<string, QuestionResult>>(cachedResults);
  const [customQuestion, setCustomQuestion] = useState("");
  const [runningAll, setRunningAll] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  // Use a ref to track the latest results so we can sync to parent without
  // causing an infinite useEffect loop
  const resultsRef = useRef(results);

  // When workstream tab changes, restore from cache
  useEffect(() => {
    setResults(cachedResults);
    resultsRef.current = cachedResults;
  }, [workstream.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: update results and sync to parent cache in one shot
  const updateResults = useCallback(
    (updater: (prev: Record<string, QuestionResult>) => Record<string, QuestionResult>) => {
      setResults((prev) => {
        const next = updater(prev);
        resultsRef.current = next;
        // Sync to parent cache immediately
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

  const handleEvent = useCallback((event: WorkstreamEvent) => {
    const q = event.question;
    if (event.type === "token") {
      updateResults((prev) => ({
        ...prev,
        [q]: {
          ...prev[q],
          answer: (prev[q]?.answer || "") + event.token,
          citations: prev[q]?.citations || [],
          status: "loading",
        },
      }));
    } else if (event.type === "done") {
      updateResults((prev) => ({
        ...prev,
        [q]: {
          answer: event.answer,
          citations: event.citations,
          status: "complete",
          model: event.model,
          fallback: event.fallback,
          duration_ms: event.duration_ms,
        },
      }));
    } else if (event.type === "error") {
      updateResults((prev) => ({
        ...prev,
        [q]: {
          answer: event.error,
          citations: [],
          status: "error",
        },
      }));
    }
  }, [updateResults]);

  const runAllQuestions = useCallback(() => {
    controllerRef.current?.abort();

    const questions = workstream.templates.map((t) => t.query);

    // Set all to loading
    updateResults((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        next[q] = { answer: "", citations: [], status: "loading" };
      }
      return next;
    });
    setRunningAll(true);

    controllerRef.current = workstreamStream(
      dealId,
      workstream.id,
      questions,
      handleEvent,
      () => setRunningAll(false),
      (err) => {
        console.error("Workstream stream error:", err);
        setRunningAll(false);
      }
    );
  }, [dealId, workstream, handleEvent, updateResults]);

  const runSingleQuestion = useCallback(
    (question: string) => {
      controllerRef.current?.abort();

      updateResults((prev) => ({
        ...prev,
        [question]: { answer: "", citations: [], status: "loading" },
      }));

      controllerRef.current = singleQuestionStream(
        dealId,
        question,
        workstream.id,
        handleEvent,
        undefined,
        (err) => console.error("Single question stream error:", err)
      );
    },
    [dealId, workstream.id, handleEvent, updateResults]
  );

  const handleCustomSubmit = useCallback(() => {
    const q = customQuestion.trim();
    if (!q) return;
    runSingleQuestion(q);
    setCustomQuestion("");
  }, [customQuestion, runSingleQuestion]);

  return (
    <div className="flex flex-col h-full">
      {/* Workstream header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-xl">{workstream.icon}</span>
            {workstream.name}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {workstream.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {completedCount > 0 && (
            <span className="text-xs text-gray-400">
              {completedCount}/{workstream.templates.length} complete
            </span>
          )}
          <button
            onClick={runAllQuestions}
            disabled={runningAll}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              runningAll
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {runningAll ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                Running...
              </span>
            ) : (
              "Run Full Workstream"
            )}
          </button>
        </div>
      </div>

      {/* Custom question input */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
            placeholder={`Ask a custom ${workstream.name.toLowerCase()} question...`}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customQuestion.trim()}
            className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </div>
      </div>

      {/* Questions list */}
      <div className="flex-1 overflow-y-auto">
        {workstream.templates.map((template) => {
          const result = results[template.query];
          return (
            <QuestionRow
              key={template.query}
              label={template.label}
              query={template.query}
              result={result}
              onRun={() => runSingleQuestion(template.query)}
              onViewDocument={onViewDocument}
            />
          );
        })}

        {/* Show custom question results that aren't in templates */}
        {Object.entries(results)
          .filter(
            ([q]) => !workstream.templates.some((t) => t.query === q)
          )
          .map(([query, result]) => (
            <QuestionRow
              key={query}
              label="Custom question"
              query={query}
              result={result}
              onRun={() => runSingleQuestion(query)}
              onViewDocument={onViewDocument}
            />
          ))}
      </div>
    </div>
  );
}

function QuestionRow({
  label,
  query,
  result,
  onRun,
  onViewDocument,
}: {
  label: string;
  query: string;
  result: QuestionResult | undefined;
  onRun: () => void;
  onViewDocument?: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = result && result.status !== "pending";
  const cleanAnswer = result?.answer ? stripThinkTags(result.answer) : "";
  const sourceCount = result?.citations
    ? result.citations.filter((c) => c !== null).length
    : 0;

  // Auto-expand when loading starts
  useEffect(() => {
    if (result?.status === "loading") setExpanded(true);
  }, [result?.status]);

  return (
    <div className="border-b border-gray-100">
      {/* Question header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
          hasResult ? "bg-white" : ""
        }`}
        onClick={() => hasResult && setExpanded(!expanded)}
      >
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {result?.status === "complete" ? (
            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          ) : result?.status === "loading" ? (
            <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          ) : result?.status === "error" ? (
            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600 text-xs font-bold">!</span>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-gray-200" />
          )}
        </div>

        {/* Question text */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800">{label}</div>
          <div className="text-xs text-gray-400 truncate">{query}</div>
        </div>

        {/* Actions + model analytics (matching MatrixCell style) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {result?.status === "complete" && result.model && (
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  result.fallback
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {result.model}
              </span>
              {result.fallback && (
                <span className="text-[10px] text-amber-600 font-medium">
                  fallback
                </span>
              )}
              {result.duration_ms != null && (
                <span className="text-[10px] text-gray-400">
                  {(result.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
          {sourceCount > 0 && result?.status === "complete" && (
            <span className="text-[10px] text-blue-500">
              {sourceCount} source{sourceCount > 1 ? "s" : ""}
            </span>
          )}
          {hasResult && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            title="Run this question"
          >
            {result?.status === "loading" ? "Running..." : hasResult ? "Re-run" : "Run"}
          </button>
        </div>
      </div>

      {/* Answer content */}
      {(expanded || result?.status === "loading") && hasResult && (
        <div className="px-4 pb-4 pl-12">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
            {result.status === "loading" && cleanAnswer.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                Analyzing...
              </div>
            ) : (
              <>
                <div className="prose prose-sm max-w-none text-gray-800">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="not-prose overflow-x-auto my-3 rounded-lg border border-gray-200 shadow-sm bg-white">
                          <table className="text-xs border-collapse w-full min-w-[280px]">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-gradient-to-b from-slate-50 to-slate-100/80">
                          {children}
                        </thead>
                      ),
                      th: ({ children }) => {
                        const text = typeof children === "string" ? children : String(children ?? "");
                        const isDelta = isDeltaHeader(text);
                        return (
                          <th
                            className={`border-b border-r border-gray-200 last:border-r-0 px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap tracking-wide ${
                              isDelta
                                ? "text-gray-500 bg-gray-50/50 italic"
                                : "text-gray-700"
                            }`}
                          >
                            {children}
                          </th>
                        );
                      },
                      tr: ({ children }) => (
                        <tr className="even:bg-slate-50/40 hover:bg-blue-50/30 transition-colors border-b border-gray-100 last:border-b-0">
                          {children}
                        </tr>
                      ),
                      td: ({ children }) => {
                        const text = typeof children === "string" ? children : "";
                        const raw = Array.isArray(children)
                          ? children.map((c: unknown) => (typeof c === "string" ? c : "")).join("")
                          : text;
                        const delta = isDeltaCell(raw);
                        return (
                          <td
                            className={`border-r border-gray-100 last:border-r-0 px-3 py-2 text-xs tabular-nums font-medium ${
                              delta === "positive"
                                ? "text-emerald-700 bg-emerald-50/40"
                                : delta === "negative"
                                ? "text-red-700 bg-red-50/40"
                                : "text-gray-700"
                            }`}
                          >
                            {processCitations(children, result.citations, onViewDocument)}
                          </td>
                        );
                      },
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
                      h1: ({ children }) => (
                        <h3 className="text-base font-bold mt-3 mb-1.5 text-gray-900">{children}</h3>
                      ),
                      h2: ({ children }) => (
                        <h4 className="text-sm font-bold mt-2.5 mb-1 text-gray-900">{children}</h4>
                      ),
                      h3: ({ children }) => (
                        <h5 className="text-sm font-semibold mt-2 mb-1 text-gray-800">{children}</h5>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-gray-900">
                          {children}
                        </strong>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-3 border-blue-300 pl-3 my-2 text-sm text-gray-600 italic">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {cleanAnswer}
                  </ReactMarkdown>
                </div>
                {result.status === "loading" && (
                  <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                )}
                {/* Bottom analytics bar (matches MatrixCell) */}
                {result.status === "complete" && (
                  <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                    {sourceCount > 0 && (
                      <span className="text-xs text-blue-500">
                        {sourceCount} source{sourceCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {result.model && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                            result.fallback
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {result.model}
                        </span>
                        {result.fallback && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            fallback
                          </span>
                        )}
                        {result.duration_ms != null && (
                          <span className="text-[10px] text-gray-400">
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
