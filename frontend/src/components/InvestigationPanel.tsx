"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentFinding, FollowupTurn, InvestigationSummary } from "@/lib/api";
import { useInvestigation } from "@/hooks/useInvestigation";

interface Props {
  open: boolean;
  dealId: string | null;
  dealName?: string;
  initialGoal?: string;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<AgentFinding["severity"], string> = {
  info: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  watch:
    "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  red_flag:
    "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800",
};

const SEVERITY_LABELS: Record<AgentFinding["severity"], string> = {
  info: "Info",
  watch: "Watch",
  red_flag: "Red flag",
};

export default function InvestigationPanel({
  open,
  dealId,
  dealName,
  initialGoal,
  onClose,
}: Props) {
  const {
    state,
    start,
    stop,
    reset,
    refreshHistory,
    loadInvestigation,
    removeInvestigation,
    sendFollowup,
  } = useInvestigation();

  const [goalInput, setGoalInput] = useState(initialGoal || "");
  const [showHistory, setShowHistory] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFindings, setShowFindings] = useState(true);
  const [showMemo, setShowMemo] = useState(true);
  const [showFollowup, setShowFollowup] = useState(true);
  const [copied, setCopied] = useState(false);
  const [followupDraft, setFollowupDraft] = useState("");
  const memoEndRef = useRef<HTMLDivElement>(null);
  const followupEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGoalInput(initialGoal || "");
  }, [dealId, initialGoal]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (dealId) {
      refreshHistory(dealId);
    }
  }, [open, dealId, reset, refreshHistory]);

  useEffect(() => {
    if (state.status === "writing_memo") {
      memoEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.memo, state.status]);

  useEffect(() => {
    if (state.followupStatus === "streaming" || state.followupStatus === "sending") {
      followupEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.followupDraftAnswer, state.followups, state.followupStatus]);

  if (!open || !dealId) return null;

  const running =
    state.status === "starting" ||
    state.status === "thinking" ||
    state.status === "writing_memo";

  const canFollowup =
    !!state.investigationId &&
    (state.status === "done") &&
    state.followupStatus !== "sending" &&
    state.followupStatus !== "streaming";

  const handleStart = () => {
    if (!dealId) return;
    start(dealId, goalInput.trim());
  };

  const handleNew = () => {
    reset();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(state.memo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const handleSendFollowup = () => {
    const q = followupDraft.trim();
    if (!q) return;
    sendFollowup(q);
    setFollowupDraft("");
  };

  const hasActiveRun =
    state.status !== "idle" || !!state.investigationId || !!state.memo;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed top-0 right-0 bottom-0 w-full max-w-[720px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Investigate · Beta
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {dealName || dealId}
            </h2>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Autonomous diligence agent
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Control bar */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {state.readOnly ? "Viewing past investigation" : "Goal (optional)"}
            </label>
            {hasActiveRun && !running && (
              <button
                onClick={handleNew}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                + New investigation
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={state.readOnly ? state.goal : goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              disabled={running || state.readOnly}
              placeholder="e.g. focus on revenue quality, or screen for IC"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !running && !state.readOnly) handleStart();
              }}
            />
            {running ? (
              <button
                onClick={stop}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
              >
                Stop
              </button>
            ) : state.readOnly ? (
              <button
                onClick={handleNew}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                New
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                {state.status === "done" ? "Re-run" : "Start"}
              </button>
            )}
          </div>
          {state.status !== "idle" && (
            <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              <StatusDot status={state.status} />
              <span>{statusLabel(state.status)}</span>
              {state.model && state.status === "done" && (
                <span className="ml-auto font-mono">
                  {state.model}
                  {state.fallback ? " · fallback" : ""}
                  {state.duration_ms != null
                    ? ` · ${(state.duration_ms / 1000).toFixed(1)}s`
                    : ""}
                </span>
              )}
            </div>
          )}
          {state.error && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">
              {state.error}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* History */}
          <Section
            title="History"
            count={state.history.length}
            open={showHistory}
            onToggle={() => setShowHistory((v) => !v)}
          >
            <HistoryList
              items={state.history}
              loading={state.historyLoading}
              selectedId={state.investigationId}
              onSelect={(id) => loadInvestigation(dealId, id)}
              onDelete={(id) => removeInvestigation(dealId, id)}
            />
          </Section>

          {/* Transcript */}
          <Section
            title="Transcript"
            count={state.transcript.length}
            open={showTranscript}
            onToggle={() => setShowTranscript((v) => !v)}
          >
            {state.transcript.length === 0 ? (
              <Placeholder text="The agent's reasoning and tool calls will appear here." />
            ) : (
              <ul className="space-y-2">
                {state.transcript.map((entry, i) => (
                  <li key={i}>
                    {entry.kind === "thought" && (
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {entry.text}
                      </div>
                    )}
                    {entry.kind === "tool" && (
                      <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2">
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            {entry.tool}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 truncate">
                            {compactArgs(entry.args)}
                          </span>
                        </div>
                        {entry.summary ? (
                          <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                            → {entry.summary}
                          </div>
                        ) : (
                          <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 italic">
                            running…
                          </div>
                        )}
                      </div>
                    )}
                    {entry.kind === "finding" && (
                      <FindingChip finding={entry.finding} inline />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Findings */}
          <Section
            title="Findings"
            count={state.findings.length}
            open={showFindings}
            onToggle={() => setShowFindings((v) => !v)}
          >
            {state.findings.length === 0 ? (
              <Placeholder text="Material findings will be pinned here as the agent flags them." />
            ) : (
              <ul className="space-y-2">
                {state.findings.map((f, i) => (
                  <li key={i}>
                    <FindingChip finding={f} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Memo */}
          <Section
            title="Memo"
            open={showMemo}
            onToggle={() => setShowMemo((v) => !v)}
            right={
              state.memo && (
                <button
                  onClick={handleCopy}
                  className="text-[11px] px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              )
            }
          >
            {state.memo ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {state.memo}
                </ReactMarkdown>
                {state.status === "writing_memo" && (
                  <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                )}
                <div ref={memoEndRef} />
              </div>
            ) : (
              <Placeholder text="The final investment memo streams in once the agent wraps up." />
            )}
          </Section>

          {/* Follow-up chat */}
          {state.investigationId && (state.status === "done" || state.followups.length > 0) && (
            <Section
              title="Follow-up questions"
              count={state.followups.filter((f) => f.role === "user").length}
              open={showFollowup}
              onToggle={() => setShowFollowup((v) => !v)}
            >
              <FollowupThread
                turns={state.followups}
                draftAnswer={
                  state.followupStatus === "streaming" ? state.followupDraftAnswer : ""
                }
                isStreaming={
                  state.followupStatus === "streaming" ||
                  state.followupStatus === "sending"
                }
                error={state.followupError}
                endRef={followupEndRef}
              />
              <div className="mt-3 flex gap-2">
                <textarea
                  value={followupDraft}
                  onChange={(e) => setFollowupDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && canFollowup) {
                      e.preventDefault();
                      handleSendFollowup();
                    }
                  }}
                  disabled={!canFollowup}
                  rows={2}
                  placeholder={
                    canFollowup
                      ? "Ask a follow-up — grounded in this investigation's memo and findings."
                      : running
                      ? "Wait for the investigation to finish…"
                      : "Select a completed investigation to ask follow-ups."
                  }
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60 resize-none"
                />
                <button
                  onClick={handleSendFollowup}
                  disabled={!canFollowup || !followupDraft.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
                >
                  Send
                </button>
              </div>
            </Section>
          )}
        </div>
      </aside>
    </>
  );
}

function HistoryList({
  items,
  loading,
  selectedId,
  onSelect,
  onDelete,
}: {
  items: InvestigationSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading && items.length === 0) {
    return <Placeholder text="Loading history…" />;
  }
  if (items.length === 0) {
    return <Placeholder text="No prior investigations yet. Start one above." />;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const selected = selectedId === item.id;
        return (
          <li key={item.id}>
            <div
              className={`group rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                selected
                  ? "border-blue-400 dark:border-blue-600 bg-blue-50/60 dark:bg-blue-950/40"
                  : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
              onClick={() => onSelect(item.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {item.goal || "General diligence"}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                    <StatusBadge status={item.status} />
                    {item.finding_count > 0 && <span>· {item.finding_count} findings</span>}
                    {item.followup_count > 0 && <span>· {item.followup_count} Q&A</span>}
                    {item.created_at && (
                      <span className="ml-auto">{formatRelative(item.created_at)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this investigation?")) onDelete(item.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-red-500 transition-opacity"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FollowupThread({
  turns,
  draftAnswer,
  isStreaming,
  error,
  endRef,
}: {
  turns: FollowupTurn[];
  draftAnswer: string;
  isStreaming: boolean;
  error: string | null;
  endRef: React.RefObject<HTMLDivElement>;
}) {
  if (turns.length === 0 && !isStreaming) {
    return (
      <Placeholder text="Ask questions grounded in this investigation's memo, findings, and evidence." />
    );
  }
  return (
    <div className="space-y-3">
      {turns.map((turn, i) => (
        <div
          key={i}
          className={
            turn.role === "user"
              ? "rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2"
              : "rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2"
          }
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            {turn.role === "user" ? "You" : "Agent"}
          </div>
          {turn.role === "assistant" ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {turn.content}
            </div>
          )}
        </div>
      ))}
      {isStreaming && (
        <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            Agent
          </div>
          {draftAnswer ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftAnswer}</ReactMarkdown>
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
              Thinking…
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">
          Follow-up failed: {error}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  right,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between px-5 py-2.5 bg-white dark:bg-gray-950 sticky top-0 z-10">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span className="text-xs">{open ? "▾" : "▸"}</span>
          <span>{title}</span>
          {typeof count === "number" && count > 0 && (
            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {count}
            </span>
          )}
        </button>
        {right}
      </div>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="text-xs text-gray-400 dark:text-gray-500 italic py-1.5">
      {text}
    </div>
  );
}

function FindingChip({
  finding,
  inline = false,
}: {
  finding: AgentFinding;
  inline?: boolean;
}) {
  const style = SEVERITY_STYLES[finding.severity];
  return (
    <div
      className={`rounded-md border px-3 py-2 ${style} ${inline ? "text-xs" : "text-sm"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {SEVERITY_LABELS[finding.severity]}
        </span>
        <span className="text-xs font-medium truncate">{finding.category}</span>
      </div>
      <div className={inline ? "text-xs" : "text-sm"}>{finding.claim}</div>
      {finding.citations && finding.citations.length > 0 && (
        <div className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
          {finding.citations
            .map((c) => `${c.source_file} p.${c.page}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "error"
      ? "bg-red-500"
      : status === "done"
      ? "bg-green-500"
      : status === "idle"
      ? "bg-gray-400"
      : "bg-blue-500 animate-pulse";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "complete"
      ? "text-green-600 dark:text-green-400"
      : status === "error"
      ? "text-red-600 dark:text-red-400"
      : status === "stopped"
      ? "text-amber-600 dark:text-amber-400"
      : "text-blue-600 dark:text-blue-400";
  return <span className={cls}>{status}</span>;
}

function statusLabel(status: string): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "starting":
      return "Starting…";
    case "thinking":
      return "Investigating…";
    case "writing_memo":
      return "Writing memo…";
    case "done":
      return "Done";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function compactArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => {
    const s = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
    return `${k}=${s.length > 60 ? s.slice(0, 59) + "…" : s}`;
  });
  return parts.join(", ");
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}
