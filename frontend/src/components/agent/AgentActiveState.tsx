"use client";

import { useEffect, useRef } from "react";
import { ACCENT } from "@/components/dd/types";
import BoldText from "./BoldText";
import AgentMemoText from "./AgentMemoText";
import AgentFindingCard from "./AgentFindingCard";
import type { AgentDoc, AgentFollowupTurn, AgentLocalCitation, RunState } from "./types";
import { SEV } from "./types";

interface Props {
  runState: RunState;
  docs: AgentDoc[];
  activeCitationId: string | null;
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
  followups,
  followupDraft,
  followupStreaming,
  onCitation,
  onReset,
  onWorkspace,
  onFollowupDraft,
  onSendFollowup,
}: Props) {
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const isRunning = runState.phase === "running";
  const isDone = runState.phase === "complete";
  const completedTasks = runState.tasks.filter((task) => task.status === "complete").length;
  const dealBreakers = runState.findings.filter((finding) => finding.sev === "deal-breaker").length;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [followups]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
          <div className="fade-up" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Your request
            </div>
            <div style={{ padding: "14px 16px", background: "white", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 14, color: "#1e293b", lineHeight: 1.65, borderLeft: `3px solid ${ACCENT}` }}>
              {runState.prompt}
            </div>
          </div>

          <div className="fade-up" style={{ marginBottom: 24, animationDelay: ".1s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Agent plan</span>
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                {isRunning ? <><Spinner size={11} color="#94a3b8" /> Analyzing {completedTasks}/{runState.tasks.length}...</> : `${completedTasks}/${runState.tasks.length} tasks complete`}
              </span>
            </div>

            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
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
                    borderBottom: i < runState.tasks.length - 1 ? "1px solid #f1f5f9" : "none",
                    background: taskRunning ? "#f8faff" : "white",
                    transition: "background .2s",
                  }}>
                    <div style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {taskDone ? (
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.5" strokeLinecap="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : taskRunning ? (
                        <Spinner size={18} color={task.color} />
                      ) : (
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #e2e8f0" }} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: taskPending ? "#94a3b8" : "#1e293b", marginBottom: taskRunning ? 5 : 0 }}>
                        {task.label}
                      </div>
                      {taskRunning && task.pagesTotal > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 2.5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
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
                            background: taskDone || taskRunning ? `${d.color}18` : "#f1f5f9",
                            color: taskDone || taskRunning ? d.color : "#94a3b8",
                            border: `1px solid ${taskDone || taskRunning ? `${d.color}44` : "#e2e8f0"}`,
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
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                Findings surfaced
                <span style={{ padding: "1px 6px", borderRadius: 99, background: dealBreakers > 0 ? "#fef2f2" : "#f1f5f9", color: dealBreakers > 0 ? "#dc2626" : "#64748b", fontSize: 10, fontWeight: 700, border: `1px solid ${dealBreakers > 0 ? "#fecaca" : "#e2e8f0"}` }}>
                  {runState.findings.length} found
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {runState.findings.map((finding, index) => (
                  <AgentFindingCard
                    key={finding.id}
                    finding={finding}
                    index={index}
                    tasks={runState.tasks}
                    activeCitationId={activeCitationId}
                    onCitation={onCitation}
                  />
                ))}
              </div>
            </div>
          )}

          {(runState.synthText || runState.error) && (
            <div className="fade-up" style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                Agent synthesis
                {isRunning && <Spinner size={11} color="#94a3b8" />}
                {runState.synthDone && <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>✓ Complete</span>}
              </div>
              <div style={{ background: "white", border: `1px solid ${runState.error ? "#fecdd3" : "#e2e8f0"}`, borderRadius: 10, padding: "16px 18px", color: runState.error ? "#9f1239" : "#1e293b" }}>
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
                <button onClick={onReset} style={{ padding: "8px 16px", background: "white", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  New analysis
                </button>
                <button onClick={onWorkspace} style={{ padding: "8px 16px", background: ACCENT, color: "white", borderRadius: 7, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
                  View in Workspace →
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px 0 10px" }}>
                <div style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Follow-up questions
                </span>
                <div style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
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
                        e.currentTarget.style.background = "#f1f5f9";
                        e.currentTarget.style.borderColor = "#cbd5e1";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f8fafc";
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                      style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, color: "#475569", cursor: "pointer" }}
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
                      <div style={{ maxWidth: "82%", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px 10px 4px 10px", fontSize: 12, color: "#1e3a8a", lineHeight: 1.55 }}>
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
                      <div style={{ flex: 1, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px 10px 10px 4px", fontSize: 12, color: "#334155", lineHeight: 1.65 }}>
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
        <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", background: "white", flexShrink: 0 }}>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8 }}>
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
              style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1.5px solid #e2e8f0", borderRadius: 8, outline: "none", resize: "none", lineHeight: 1.5, background: followupStreaming ? "#f8fafc" : "white" }}
            />
            <button
              onClick={onSendFollowup}
              disabled={!followupDraft.trim() || followupStreaming || !runState.investigationId}
              style={{
                padding: "0 18px",
                height: 52,
                background: followupDraft.trim() && !followupStreaming && runState.investigationId ? ACCENT : "#e2e8f0",
                color: followupDraft.trim() && !followupStreaming && runState.investigationId ? "white" : "#94a3b8",
                borderRadius: 8,
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
