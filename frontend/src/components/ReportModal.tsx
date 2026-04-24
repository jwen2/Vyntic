"use client";
import { useState, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Deal,
  generateICReport,
  ReportDeal,
  ReportWorkstream,
  ReportQuestion,
  ReportCitation,
  Citation,
} from "@/lib/api";
import { DD_WORKSTREAMS } from "@/lib/queryTemplates";
import { QuestionResult } from "./WorkstreamPanel";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;

interface Props {
  deal: Deal;
  resultCache: WorkstreamCache;
  onClose: () => void;
}

const WORKSTREAM_META: Record<string, { name: string; icon: string }> = {
  financial: { name: "Financial DD", icon: "📊" },
  commercial: { name: "Commercial DD", icon: "🏢" },
  operational: { name: "Operational DD", icon: "⚙️" },
  legal: { name: "Legal DD", icon: "⚖️" },
  risk: { name: "Risk Scorecard", icon: "🚦" },
};

const SOURCE_PATTERN = /\[Source\s+(\d+)\]/g;

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function isDeltaCell(text: string): "positive" | "negative" | null {
  const cleaned = text.replace(/\*+/g, "").trim();
  if (/^\+/.test(cleaned)) return "positive";
  if (/^[-\u2013]/.test(cleaned) && !/^[-\u2013:]+$/.test(cleaned))
    return "negative";
  if (/\([-\u2013]/.test(cleaned)) return "negative";
  return null;
}

function renderCitationBadge(
  idx: number,
  citations: (Citation | null)[]
): React.ReactNode {
  const c = citations[idx - 1];
  return (
    <span
      key={`cite-${idx}`}
      className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 cursor-default"
      title={
        c
          ? `${c.source_file}, p. ${c.page}\n${c.text_snippet?.slice(0, 150)}`
          : `Source ${idx}`
      }
    >
      {idx}
    </span>
  );
}

function renderTextWithCitations(
  text: string,
  citations: (Citation | null)[]
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(SOURCE_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(renderCitationBadge(parseInt(match[1], 10), citations));
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** Build the report payload from cached results */
function buildReportPayload(
  deal: Deal,
  selected: Set<string>,
  resultCache: WorkstreamCache,
  title: string
): { request: { title: string; deals: ReportDeal[] }; workstreams: ReportWorkstream[] } {
  const workstreams: ReportWorkstream[] = [];

  for (const wsId of Array.from(selected)) {
    const ws = DD_WORKSTREAMS.find((w) => w.id === wsId);
    if (!ws) continue;
    const cached = resultCache[wsId] || {};
    const questions: ReportQuestion[] = [];

    for (const template of ws.templates) {
      const result = cached[template.query];
      if (!result || result.status !== "complete") continue;
      const citations: ReportCitation[] = (result.citations || [])
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({
          source_file: c.source_file,
          page: c.page,
          text_snippet: c.text_snippet,
        }));
      questions.push({
        label: template.label,
        question: template.query,
        answer: result.answer,
        citations,
      });
    }

    for (const [query, result] of Object.entries(cached)) {
      if (ws.templates.some((t) => t.query === query)) continue;
      if (result.status !== "complete") continue;
      const citations: ReportCitation[] = (result.citations || [])
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({
          source_file: c.source_file,
          page: c.page,
          text_snippet: c.text_snippet,
        }));
      questions.push({
        label: "Custom question",
        question: query,
        answer: result.answer,
        citations,
      });
    }

    if (questions.length > 0) {
      workstreams.push({
        workstream_id: wsId,
        workstream_name: WORKSTREAM_META[wsId]?.name || wsId,
        questions,
      });
    }
  }

  const reportDeal: ReportDeal = {
    deal_id: deal.deal_id,
    name: deal.name,
    stage: deal.stage,
    tags: deal.tags,
    document_count: deal.document_count,
    workstreams,
  };

  return { request: { title, deals: [reportDeal] }, workstreams };
}

// ── Preview renderer ──────────────────────────────────────────────────────

function ReportPreview({
  deal,
  title,
  workstreams,
}: {
  deal: Deal;
  title: string;
  workstreams: ReportWorkstream[];
}) {
  return (
    <div className="bg-white">
      {/* Title page */}
      <div className="text-center py-10 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <div className="w-48 h-px bg-blue-300 mx-auto my-4" />
        <p className="text-lg text-gray-700">{deal.name}</p>
        <p className="text-sm text-gray-400 mt-3">
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <p className="text-xs text-gray-400 mt-6 font-medium tracking-wide">
          CONFIDENTIAL — For Investment Committee Use Only
        </p>
      </div>

      {/* Executive summary */}
      <div className="px-6 py-6 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Executive Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Deal
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Stage
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Sectors
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Docs
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold">
                  Workstreams
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-800">
                  {deal.name}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {deal.stage || "—"}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {deal.tags?.join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {deal.document_count}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {workstreams.map((w) => w.workstream_name).join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Workstream sections */}
      {workstreams.map((ws) => {
        return (
          <div key={ws.workstream_id} className="px-6 py-5 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>{WORKSTREAM_META[ws.workstream_id]?.icon}</span>
              {ws.workstream_name}
            </h2>

            {ws.questions.map((q, qi) => {
              const citations: (Citation | null)[] = q.citations.map((c) => ({
                source_file: c.source_file,
                page: c.page,
                text_snippet: c.text_snippet,
              }));
              const answer = stripThinkTags(q.answer);

              return (
                <div key={qi} className="mb-5">
                  <h3 className="text-sm font-semibold text-blue-800 mb-1">
                    {q.label}
                  </h3>
                  <p className="text-xs text-gray-400 italic mb-2">
                    {q.question}
                  </p>
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
                          <thead className="bg-gradient-to-b from-slate-600 to-slate-700 text-white">
                            {children}
                          </thead>
                        ),
                        th: ({ children }) => (
                          <th className="border-b border-r border-slate-500 last:border-r-0 px-3 py-2 text-[11px] font-semibold text-left whitespace-nowrap text-white">
                            {children}
                          </th>
                        ),
                        tr: ({ children }) => (
                          <tr className="even:bg-slate-50/60 hover:bg-blue-50/30 transition-colors border-b border-gray-100 last:border-b-0">
                            {children}
                          </tr>
                        ),
                        td: ({ children }) => {
                          const raw = Array.isArray(children)
                            ? children
                                .map((c: unknown) =>
                                  typeof c === "string" ? c : ""
                                )
                                .join("")
                            : typeof children === "string"
                            ? children
                            : "";
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
                              {renderTextWithCitations(
                                raw,
                                citations
                              )}
                            </td>
                          );
                        },
                        p: ({ children }) => {
                          const text =
                            typeof children === "string"
                              ? children
                              : Array.isArray(children)
                              ? children
                                  .map((c: unknown) =>
                                    typeof c === "string" ? c : ""
                                  )
                                  .join("")
                              : "";
                          return (
                            <p className="my-1.5 text-sm leading-relaxed">
                              {renderTextWithCitations(text, citations)}
                            </p>
                          );
                        },
                        strong: ({ children }) => (
                          <strong className="font-semibold text-gray-900">
                            {children}
                          </strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="my-1.5 ml-4 list-disc space-y-1 text-sm">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="my-1.5 ml-4 list-decimal space-y-1 text-sm">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => {
                          const text =
                            typeof children === "string"
                              ? children
                              : Array.isArray(children)
                              ? children
                                  .map((c: unknown) =>
                                    typeof c === "string" ? c : ""
                                  )
                                  .join("")
                              : "";
                          return (
                            <li className="text-sm leading-relaxed">
                              {renderTextWithCitations(text, citations)}
                            </li>
                          );
                        },
                      }}
                    >
                      {answer}
                    </ReactMarkdown>
                  </div>
                  {/* Citation badges */}
                  {q.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {q.citations.map((c, ci) => (
                        <span
                          key={ci}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500"
                          title={c.text_snippet?.slice(0, 200)}
                        >
                          <span className="font-medium text-blue-600">
                            [{ci + 1}]
                          </span>
                          {c.source_file}, p.{c.page}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

type Step = "configure" | "preview";

export default function ReportModal({ deal, resultCache, onClose }: Props) {
  const [step, setStep] = useState<Step>("configure");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Investment Committee Report");

  const workstreamStatus = useMemo(() => {
    const status: Record<string, { total: number; completed: number }> = {};
    for (const ws of DD_WORKSTREAMS) {
      if (ws.id === "documents") continue;
      const cached = resultCache[ws.id] || {};
      const completedQuestions = ws.templates.filter(
        (t) => cached[t.query]?.status === "complete"
      );
      status[ws.id] = {
        total: ws.templates.length,
        completed: completedQuestions.length,
      };
    }
    return status;
  }, [resultCache]);

  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const [wsId, s] of Object.entries(workstreamStatus)) {
      if (s.completed > 0) initial.add(wsId);
    }
    return initial;
  });

  const toggleWorkstream = (wsId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  };

  const totalQuestions = useMemo(() => {
    let count = 0;
    for (const wsId of Array.from(selected)) {
      count += workstreamStatus[wsId]?.completed || 0;
    }
    return count;
  }, [selected, workstreamStatus]);

  const payload = useMemo(
    () => buildReportPayload(deal, selected, resultCache, title),
    [deal, selected, resultCache, title]
  );

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateICReport(payload.request);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }, [payload, onClose]);

  // ── Configure step ──────────────────────────────────────────────────
  if (step === "configure") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Generate IC Report
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Export a Word document for {deal.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-4 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Report Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Include Workstreams
              </label>
              <div className="space-y-2">
                {Object.entries(workstreamStatus).map(([wsId, status]) => {
                  const meta = WORKSTREAM_META[wsId];
                  const hasResults = status.completed > 0;
                  const isSelected = selected.has(wsId);
                  return (
                    <label
                      key={wsId}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        !hasResults
                          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "border-blue-200 bg-blue-50/50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!hasResults}
                        onChange={() => toggleWorkstream(wsId)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="text-base">{meta?.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800">
                          {meta?.name || wsId}
                        </div>
                        <div className="text-xs text-gray-500">
                          {hasResults
                            ? `${status.completed}/${status.total} questions completed`
                            : "No results — run this workstream first"}
                        </div>
                      </div>
                      {hasResults && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          {status.completed}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {totalQuestions > 0
                ? `${totalQuestions} questions across ${selected.size} workstream${selected.size !== 1 ? "s" : ""}`
                : "Select at least one workstream with results"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("preview")}
                disabled={totalQuestions === 0}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  totalQuestions === 0
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Preview Report
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview step ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("configure")}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              title="Back to settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Report Preview
              </h2>
              <p className="text-xs text-gray-500">
                Review before downloading
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable preview */}
        <div className="flex-1 overflow-y-auto">
          <ReportPreview
            deal={deal}
            title={title}
            workstreams={payload.workstreams}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setStep("configure")}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs text-red-600 mr-2">{error}</span>
            )}
            <button
              onClick={handleDownload}
              disabled={generating}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
                generating
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download DOCX
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
