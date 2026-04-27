"use client";

import { useEffect, useRef } from "react";
import { ACCENT, ddTheme } from "@/components/dd/types";
import { useTheme } from "@/components/ThemeProvider";
import BoldText from "./BoldText";
import AgentMemoText from "./AgentMemoText";
import AgentFindingCard from "./AgentFindingCard";
import type { AgentDoc, AgentFollowupTurn, AgentLocalCitation, RunState } from "./types";
import { SEV } from "./types";
import type { Finding } from "@/components/dd/types";

interface Props {
  runState: RunState;
  docs: AgentDoc[];
  activeCitationId: string | null;
  focusFinding?: Finding | null;
  focusSignal?: number;
  followups: AgentFollowupTurn[];
  followupDraft: string;
  followupStreaming: boolean;
  onCitation: (citation: AgentLocalCitation) => void;
  onReset: () => void;
  onWorkspace: () => void;
  onFollowupDraft: (value: string) => void;
  onSendFollowup: () => void;
}

function Spinner({ size = 14, color = ACCENT }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "spin .8s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

function docLabel(docId: string, docs: AgentDoc[]) {
  if (docId === "all") return { short: "all", color: "#64748b" };
  const found = docs.find((doc) => doc.name.toLowerCase().includes(docId) || doc.short.toLowerCase().includes(docId));
  return { short: found?.short || docId, color: found?.color || "#64748b" };
}

export default function AgentActiveState({
  runState,
  docs,
  activeCitationId,
  focusFinding,
  focusSignal = 0,
  followups,
  followupDraft,
  followupStreaming,
  onCitation,
  onReset,
  onWorkspace,
  onFollowupDraft,
  onSendFollowup,
}: Props) {
  const { theme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const focusedFindingRef = useRef<HTMLDivElement | null>(null);
  const isRunning = runState.phase === "running";
  const isDone = runState.phase === "complete";
  const completedTasks = runState.tasks.filter((task) => task.status === "complete").length;
  const dealBreakers = runState.findings.filter((finding) => finding.sev === "deal-breaker").length;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [followups]);

  useEffect(() => {
    if (!focusFinding) return;
    focusedFindingRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusFinding, focusSignal, runState.findings.length]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: c.bg }}>
      <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", padding: "32px 0 60px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 24px" }}>
          <div className="fade-up" style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Your request
            </div>
            <div style={{ padding: "12px 14px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, fontSize: 14, color: c.t1, lineHeight: 1.6, borderLeft: `3px solid ${ACCENT}` }}>
              {runState.prompt}
            </div>
          </div>

          <div className="fade-up" style={{ marginBottom: 28, animationDelay: ".1s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.t1 }}>Agent plan</span>
              <span style={{ fontSize: 11, color: c.t2, display: "flex", alignItems: "center", gap: 5 }}>
                {isRunning ? <><Spinner size={11} color={c.t2} /> Analyzing {completedTasks}/{runState.tasks.length}...</> : `${completedTasks}/${runState.tasks.length} tasks complete`}
              </span>
            </div>

            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
              {runState.tasks.map((task, i) => {
                const taskRunning = task.status === "running";
                const taskDone = task.status === "complete";
                const taskPending = task.status === "pending";
                const pct = task.pagesTotal > 0 ? Math.min(100, Math.round((task.pagesRead / task.pagesTotal) * 100)) : 0;
                return (
                  <div key={task.id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 16px",
                    borderBottom: i < runState.tasks.length - 1 ? `1px solid ${c.borderLight}` : "none",
                    background: taskRunning ? (isDark ? "#17213a" : "#f8faff") : c.surface,
                    transition: "background .2s",
                  }}>
                    <div style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {taskDone ? (
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: isDark ? "#064e3b" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.5" strokeLinecap="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : taskRunning ? (
                        <Spinner size={18} color={task.color} />
                      ) : (
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${c.border}` }} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: taskPending ? c.t3 : c.t1, marginBottom: taskRunning ? 5 : 0 }}>
                        {task.label}
                      </div>
                      {taskRunning && task.pagesTotal > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 2.5, background: c.border, borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: task.color, borderRadius: 99, transition: "width .3s" }} />
                          </div>
                          <span className="font-mono-dm" style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>
                            {task.pagesRead}/{task.pagesTotal} pages
                          </span>
                        </div>
                      )}
                      {task.isSynth && taskRunning && (
                        <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ animation: "blink 1s ease-in-out infinite", display: "inline-block" }}>●</span> Writing synthesis...
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {task.docs.map((docId) => {
                        const d = docLabel(docId, docs);
                        return (
                          <span key={docId} className="font-mono-dm" style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: taskDone || taskRunning ? `${d.color}18` : c.surfaceAlt,
                            color: taskDone || taskRunning ? d.color : c.t3,
                            border: `1px solid ${taskDone || taskRunning ? `${d.color}44` : c.border}`,
                          }}>
                            {d.short}
                          </span>
                        );
                      })}
                    </div>

                    {taskDone && (
                      <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {task.isSynth ? "done" : `${task.pagesTotal}p read`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {runState.findings.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                Findings surfaced
                <span style={{ padding: "1px 6px", borderRadius: 99, background: dealBreakers > 0 ? (isDark ? "#7f1d1d" : "#fef2f2") : c.surfaceAlt, color: dealBreakers > 0 ? (isDark ? "#fca5a5" : "#dc2626") : c.t2, fontSize: 10, fontWeight: 700, border: `1px solid ${dealBreakers > 0 ? (isDark ? "#7f1d1d" : "#fecaca") : c.border}` }}>
                  {runState.findings.length} found
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {runState.findings.map((finding, index) => {
                  const isFocused = isSameFinding(focusFinding, finding);
                  return (
                    <div key={finding.id} ref={isFocused ? focusedFindingRef : undefined}>
                      <AgentFindingCard
                        finding={finding}
                        index={index}
                        tasks={runState.tasks}
                        activeCitationId={activeCitationId}
                        onCitation={onCitation}
                        focused={isFocused}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(runState.synthText || runState.error) && (
            <div className="fade-up" style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                Agent synthesis
                {isRunning && <Spinner size={11} color={c.t2} />}
                {runState.synthDone && <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>✓ Complete</span>}
              </div>
              <div style={{ background: c.surface, border: `1px solid ${runState.error ? "#fecdd3" : c.border}`, borderRadius: 10, padding: "16px 18px", color: runState.error ? "#fca5a5" : c.t1 }}>
                {runState.error ? runState.error : <AgentMemoText text={runState.synthText} />}
                {isRunning && !runState.synthDone && !runState.error && (
                  <span style={{ display: "inline-block", width: 2, height: 14, background: "#2563eb", animation: "blink 0.8s step-end infinite", marginLeft: 2, verticalAlign: "text-bottom" }} />
                )}
              </div>
            </div>
          )}

          {isDone && (
            <>
              <div className="fade-up" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8, marginBottom: 18 }}>
                <button onClick={onReset} style={{ padding: "9px 18px", background: c.surface, color: c.t2, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  New analysis
                </button>
                <button onClick={onWorkspace} style={{ padding: "9px 18px", background: ACCENT, color: "white", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
                  Export findings
                </button>
              </div>

              <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${c.border}` }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  Follow-up questions
                </span>
              </div>

              {followups.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {[
                    "What is the valuation impact of the highest-severity finding?",
                    "What should we ask management on the next diligence call?",
                    "How should the purchase agreement handle these findings?",
                  ].map((question) => (
                    <button
                      key={question}
                      onClick={() => onFollowupDraft(question)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${ACCENT}55`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = c.border;
                      }}
                      style={{ textAlign: "left", padding: "8px 12px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, fontSize: 12, color: c.t2, cursor: "pointer" }}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}

              {followups.map((turn, index) => (
                <div key={index} style={{ marginBottom: 8 }}>
                  {turn.role === "user" ? (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ maxWidth: "82%", padding: "8px 12px", background: isDark ? "#1e3a8a55" : "#eff6ff", border: `1px solid ${isDark ? "#3b82f644" : "#bfdbfe"}`, borderRadius: "10px 10px 4px 10px", fontSize: 12, color: isDark ? "#bfdbfe" : "#1e3a8a", lineHeight: 1.55 }}>
                        {turn.content}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                      </div>
                      <div style={{ flex: 1, padding: "8px 12px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: "10px 10px 10px 4px", fontSize: 12, color: c.t2, lineHeight: 1.65 }}>
                        <BoldText text={turn.content} />
                        {turn.streaming && <span style={{ display: "inline-block", width: 2, height: 12, background: "#2563eb", marginLeft: 2, verticalAlign: "text-bottom", animation: "blink .8s step-end infinite" }} />}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </>
          )}
        </div>
      </div>

      {isDone && (
        <div style={{ padding: "12px 24px", borderTop: `1px solid ${c.border}`, background: c.bg, flexShrink: 0 }}>
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", gap: 10 }}>
            <textarea
              value={followupDraft}
              onChange={(e) => onFollowupDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSendFollowup();
                }
              }}
              placeholder="Ask a follow-up grounded in these findings..."
              rows={2}
              disabled={followupStreaming || !runState.investigationId}
              style={{ flex: 1, padding: "11px 14px", fontSize: 13, border: `1.5px solid ${c.border}`, color: c.t1, borderRadius: 10, outline: "none", resize: "none", lineHeight: 1.5, background: followupStreaming ? c.surfaceAlt : c.surface }}
            />
            <button
              onClick={onSendFollowup}
              disabled={!followupDraft.trim() || followupStreaming || !runState.investigationId}
              style={{
                padding: "0 20px",
                height: 44,
                background: followupDraft.trim() && !followupStreaming && runState.investigationId ? ACCENT : c.border,
                color: followupDraft.trim() && !followupStreaming && runState.investigationId ? "white" : c.t3,
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: followupDraft.trim() && !followupStreaming && runState.investigationId ? "pointer" : "default",
                alignSelf: "flex-end",
              }}
            >
              {followupStreaming ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeForMatch(value: string | undefined | null): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSameFinding(target: Finding | null | undefined, candidate: RunState["findings"][number]): boolean {
  if (!target) return false;
  const targetTitle = normalizeForMatch(target.title);
  const targetDetail = normalizeForMatch(target.detail);
  const candidateTitle = normalizeForMatch(candidate.title);
  const candidateSummary = normalizeForMatch(candidate.summary);

  if (targetTitle && candidateTitle && (targetTitle === candidateTitle || candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle))) {
    return true;
  }
  if (targetDetail && candidateSummary) {
    const shortTarget = targetDetail.slice(0, 80);
    const shortCandidate = candidateSummary.slice(0, 80);
    return shortTarget.length > 20 && shortCandidate.length > 20 && (shortTarget.includes(shortCandidate) || shortCandidate.includes(shortTarget));
  }
  return false;
}
