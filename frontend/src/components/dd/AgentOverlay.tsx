"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentFinding, InvestigationEvent } from "@/lib/api";
import { askFollowup, startInvestigation } from "@/lib/api";
import type { AgentPhase, AgentPlanTask, Finding } from "./types";
import { ACCENT } from "./types";

interface Props {
  dealId: string;
  onClose: () => void;
  onComplete: (findings: Finding[]) => void;
  docShortNames: string[];
}

interface FollowupTurn {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const SUGGESTIONS = [
  "Find all red flags and deal-breakers not already surfaced",
  "Cross-validate revenue figures across CIM, QoE, and Financials",
  "Deep-scan Legal DD for undisclosed litigation or IP risks",
  "Identify concentration risks (customer, supplier, key person)",
];

const DEFAULT_PLAN: AgentPlanTask[] = [
  { id: "p1", label: "Scan CIM for commercial & market risks", docs: ["cim"], eta: "45s" },
  { id: "p2", label: "Cross-reference QoE with raw financials", docs: ["qoe", "fin"], eta: "1m 10s" },
  { id: "p3", label: "Deep-scan Legal DD for litigation exposure", docs: ["legal"], eta: "2m 20s" },
  { id: "p4", label: "Management & operational risk assessment", docs: ["ops"], eta: "1m" },
  { id: "p5", label: "Cross-document consistency validation", docs: ["cim", "qoe", "fin"], eta: "50s" },
];

function etaToSeconds(eta: string): number {
  const m = eta.match(/(\d+)m/);
  const s = eta.match(/(\d+)s/);
  return (m ? parseInt(m[1], 10) * 60 : 0) + (s ? parseInt(s[1], 10) : 0);
}

function BoldText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ fontWeight: 700, color: "#0f172a" }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function mapAgentFinding(finding: AgentFinding, index: number): Finding {
  const primaryCitation = finding.citations?.[0];
  const src = primaryCitation
    ? `${primaryCitation.source_file} · p.${primaryCitation.page}`
    : "Agent investigation";
  const category = finding.category.toLowerCase();
  const ws =
    category.includes("legal") ? "legal" :
    category.includes("commercial") || category.includes("market") || category.includes("customer") ? "commercial" :
    category.includes("financial") || category.includes("revenue") || category.includes("ebitda") ? "financial" :
    category.includes("operational") || category.includes("supplier") || category.includes("management") ? "operational" :
    "risk";

  return {
    id: `agent-${Date.now()}-${index}`,
    sev: finding.severity === "red_flag" ? "material" : "noteworthy",
    title: finding.category || "Agent finding",
    detail: finding.claim,
    src,
    ws,
    qid: null,
    conf: finding.severity === "red_flag" ? 86 : finding.severity === "watch" ? 74 : 62,
    status: null,
    note: null,
    origin: "agent",
    sourceCitation: primaryCitation
      ? {
          source_file: primaryCitation.source_file,
          page: primaryCitation.page,
          text_snippet: primaryCitation.snippet || finding.claim,
        }
      : null,
  };
}

export default function AgentOverlay({ dealId, onClose, onComplete, docShortNames: _docShortNames }: Props) {
  const [step, setStep] = useState<AgentPhase>("prompt");
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<AgentPlanTask[]>(DEFAULT_PLAN);
  const [progress, setProgress] = useState(0);
  const [completedFindings, setCompletedFindings] = useState<Finding[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [followups, setFollowups] = useState<FollowupTurn[]>([]);
  const [followupDraft, setFollowupDraft] = useState("");
  const [followupStreaming, setFollowupStreaming] = useState(false);
  const investigationIdRef = useRef<string | null>(null);
  const investigationControllerRef = useRef<AbortController | null>(null);
  const followupControllerRef = useRef<AbortController | null>(null);
  const eventProgressRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (step === "prompt") inputRef.current?.focus();
  }, [step]);

  useEffect(() => () => clearStreams(), []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [followups]);

  function clearStreams() {
    investigationControllerRef.current?.abort();
    investigationControllerRef.current = null;
    followupControllerRef.current?.abort();
    followupControllerRef.current = null;
  }

  function submit(text?: string) {
    const t = (text ?? prompt).trim();
    if (!t) return;
    setPrompt(t);
    setStep("plan");
  }

  function removeTask(id: string) {
    setPlan((p) => p.filter((t) => t.id !== id));
  }

  function runAnalysis() {
    clearStreams();
    setStep("running");
    setProgress(0);
    setCompletedFindings([]);
    setAgentError(null);
    setFollowups([]);
    setFollowupDraft("");
    setFollowupStreaming(false);
    investigationIdRef.current = null;
    eventProgressRef.current = 0;

    investigationControllerRef.current = startInvestigation(
      dealId,
      prompt || undefined,
      handleInvestigationEvent,
      undefined,
      (err) => {
        setAgentError(err.message || String(err));
        setProgress(plan.length);
        setStep("done");
      }
    );
  }

  function handleInvestigationEvent(event: InvestigationEvent) {
    if (event.type === "status" && event.investigation_id) {
      investigationIdRef.current = event.investigation_id;
    }

    if (event.type === "status" && event.status === "writing_memo") {
      setProgress(plan.length);
      return;
    }

    if (event.type === "tool_result" || event.type === "finding") {
      eventProgressRef.current = Math.min(plan.length - 1, eventProgressRef.current + 1);
      setProgress(eventProgressRef.current);
      return;
    }

    if (event.type === "done") {
      const mapped = (event.findings || []).map(mapAgentFinding);
      setCompletedFindings(mapped);
      setProgress(plan.length);
      onComplete(mapped);
      setStep("done");
      return;
    }

    if (event.type === "error") {
      setAgentError(event.error);
      setProgress(plan.length);
      setStep("done");
    }
  }

  function updateStreamingFollowup(content: string, streaming: boolean) {
    setFollowups((prev) =>
      prev.map((turn, i) =>
        i === prev.length - 1 ? { ...turn, content, streaming } : turn
      )
    );
  }

  function sendFollowup() {
    const q = followupDraft.trim();
    if (!q || followupStreaming || !investigationIdRef.current) return;

    setFollowupDraft("");
    setFollowups((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", streaming: true },
    ]);
    setFollowupStreaming(true);

    followupControllerRef.current = askFollowup(
      dealId,
      investigationIdRef.current,
      q,
      (event) => {
        if (event.type === "token") {
          setFollowups((prev) =>
            prev.map((turn, i) =>
              i === prev.length - 1
                ? { ...turn, content: turn.content + event.token }
                : turn
            )
          );
        }
        if (event.type === "done") {
          updateStreamingFollowup(event.content, false);
          setFollowupStreaming(false);
        }
        if (event.type === "error") {
          updateStreamingFollowup(`Error: ${event.error}`, false);
          setFollowupStreaming(false);
        }
      },
      undefined,
      (err) => {
        updateStreamingFollowup(`Error: ${err.message || String(err)}`, false);
        setFollowupStreaming(false);
      }
    );
  }

  const etaTotal = plan.reduce((s, t) => s + etaToSeconds(t.eta), 0);
  const etaDisplay = etaTotal > 60 ? `${Math.round(etaTotal / 60)}m` : "< 1m";

  return (
    <div
      onClick={onClose}
      className="dd-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.72)",
        backdropFilter: "blur(6px)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 92vw)",
          maxHeight: "88vh",
          background: "white",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 flex-shrink-0"
          style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0" }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
            {step === "prompt" && "Ask the agent"}
            {step === "plan" && "Review analysis plan"}
            {step === "running" && "Analyzing..."}
            {step === "done" && "Analysis complete"}
          </div>
          <div style={{ flex: 1 }} />
          <kbd
            className="font-mono-dm"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: 4,
              color: "#64748b",
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {step === "prompt" && (
            <>
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="What should the agent investigate across this deal room?"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "#0f172a",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  margin: "14px 0 8px",
                }}
              >
                Suggested
              </div>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => submit(s)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f1f5f9";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 12px",
                    marginBottom: 4,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#334155",
                    cursor: "pointer",
                    transition: "all .1s",
                  }}
                >
                  {s}
                </button>
              ))}
            </>
          )}

          {step === "plan" && (
            <>
              <Recap prompt={prompt} />
              <div
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}
              >
                Agent plan — <strong style={{ color: "#0f172a" }}>{plan.length} tasks</strong>,
                est. {etaDisplay} — edit before running
              </div>
              {plan.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5"
                  style={{
                    padding: "10px 12px",
                    marginBottom: 5,
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                  }}
                >
                  <span
                    className="font-mono-dm"
                    style={{ fontSize: 10, color: "#94a3b8", width: 16 }}
                  >
                    {i + 1}.
                  </span>
                  <div style={{ flex: 1, fontSize: 12, color: "#0f172a" }}>{t.label}</div>
                  <span
                    className="font-mono-dm"
                    style={{ fontSize: 10, color: "#64748b" }}
                  >
                    {t.eta}
                  </span>
                  <button
                    onClick={() => removeTask(t.id)}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                    title="Remove task"
                    style={{
                      color: "#cbd5e1",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      padding: "0 4px",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {plan.length === 0 && (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 12,
                    color: "#94a3b8",
                    background: "#f8fafc",
                    borderRadius: 6,
                  }}
                >
                  No tasks in plan. Go back and rephrase your prompt.
                </div>
              )}
            </>
          )}

          {(step === "running" || step === "done") && (
            <>
              <Recap prompt={prompt} />
              {plan.map((t, i) => {
                const done = i < progress;
                const running = i === progress && step === "running";
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5"
                    style={{
                      padding: "9px 12px",
                      marginBottom: 4,
                      background: running ? "#f0f9ff" : "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: done ? "#dcfce7" : running ? "#dbeafe" : "#f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {done && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.5" strokeLinecap="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {running && (
                        <svg
                          className="dd-spin"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="3"
                            strokeDasharray="28"
                            strokeDashoffset="10"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: done || running ? "#0f172a" : "#94a3b8",
                      }}
                    >
                      {t.label}
                    </div>
                    <span
                      className="font-mono-dm"
                      style={{ fontSize: 10, color: "#64748b" }}
                    >
                      {t.eta}
                    </span>
                  </div>
                );
              })}
              {step === "done" && (
                <>
                  <div
                    style={{
                      marginTop: 16,
                      padding: 14,
                      background: agentError ? "#fff1f2" : "#ecfdf5",
                      border: `1px solid ${agentError ? "#fecdd3" : "#a7f3d0"}`,
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: agentError ? "#9f1239" : "#065f46",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 8,
                      }}
                    >
                      Synthesis
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: agentError ? "#9f1239" : "#064e3b",
                        lineHeight: 1.6,
                        marginBottom: completedFindings.length > 0 ? 10 : 0,
                      }}
                    >
                      {agentError ? (
                        <>The agent run could not complete: {agentError}</>
                      ) : (
                        <>
                          Scanned {plan.length} workstream task{plan.length !== 1 ? "s" : ""} across the
                          deal room. Surfaced{" "}
                          <strong>
                            {completedFindings.length} new finding{completedFindings.length !== 1 ? "s" : ""}
                          </strong>
                          {completedFindings.length > 0 ? "." : " requiring no immediate sidebar action."}
                        </>
                      )}
                    </div>
                    {completedFindings.length > 0 && (
                      <div style={{ fontSize: 11, color: "#065f46" }}>
                        New finding{completedFindings.length !== 1 ? "s" : ""} added to{" "}
                        <strong>Red Flags</strong> in the sidebar.
                      </div>
                    )}
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    margin: "16px 0 10px",
                  }}>
                    <div style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}>
                      Follow-up questions
                    </span>
                    <div style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
                  </div>

                  {followups.length === 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                      {[
                        "What is the implied valuation impact if MegaCorp churns at renewal?",
                        "How does the EBITDA add-back discrepancy affect the purchase price?",
                        "What should we ask management about the IP litigation on the next call?",
                      ].map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setFollowupDraft(s)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#f1f5f9";
                            e.currentTarget.style.borderColor = "#cbd5e1";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#f8fafc";
                            e.currentTarget.style.borderColor = "#e2e8f0";
                          }}
                          style={{
                            textAlign: "left",
                            padding: "7px 10px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            fontSize: 11,
                            color: "#475569",
                            cursor: "pointer",
                            transition: "all .1s",
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {followups.map((turn, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      {turn.role === "user" ? (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <div style={{
                            maxWidth: "82%",
                            padding: "8px 12px",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "10px 10px 4px 10px",
                            fontSize: 12,
                            color: "#1e3a8a",
                            lineHeight: 1.55,
                          }}>
                            {turn.content}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: ACCENT,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: 2,
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                          </div>
                          <div style={{
                            flex: 1,
                            padding: "8px 12px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px 10px 10px 4px",
                            fontSize: 12,
                            color: "#334155",
                            lineHeight: 1.65,
                          }}>
                            <BoldText text={turn.content} />
                            {turn.streaming && (
                              <span style={{
                                display: "inline-block",
                                width: 2,
                                height: 12,
                                background: "#2563eb",
                                marginLeft: 2,
                                verticalAlign: "text-bottom",
                                animation: "pulse .8s ease-in-out infinite",
                              }} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 flex-shrink-0"
          style={{
            padding: "10px 14px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            background: "#f8fafc",
          }}
        >
          {step === "done" ? (
            <>
              {followups.length === 0 && (
                <button
                  onClick={onClose}
                  style={{
                    padding: "8px 12px",
                    height: 36,
                    background: "white",
                    color: "#64748b",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid #e2e8f0",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Back to workspace →
                </button>
              )}
              <textarea
                value={followupDraft}
                onChange={(e) => setFollowupDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendFollowup();
                  }
                }}
                placeholder={
                  investigationIdRef.current
                    ? "Ask a follow-up grounded in these findings..."
                    : "Follow-ups are available after a completed agent run."
                }
                rows={2}
                disabled={followupStreaming || !investigationIdRef.current}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "#0f172a",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  fontFamily: "'DM Sans', sans-serif",
                  background: followupStreaming ? "#f8fafc" : "white",
                }}
              />
              <button
                onClick={sendFollowup}
                disabled={!followupDraft.trim() || followupStreaming || !investigationIdRef.current}
                style={{
                  padding: "8px 14px",
                  height: 36,
                  background: followupDraft.trim() && !followupStreaming && investigationIdRef.current ? ACCENT : "#e2e8f0",
                  color: followupDraft.trim() && !followupStreaming && investigationIdRef.current ? "white" : "#94a3b8",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  cursor: followupDraft.trim() && !followupStreaming && investigationIdRef.current ? "pointer" : "default",
                }}
              >
                {followupStreaming ? "..." : "Send"}
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {step === "prompt" && "↵ Enter to continue · Shift+Enter for new line"}
                {step === "plan" && "× to remove a task"}
                {step === "running" && `${progress} / ${plan.length} tasks complete`}
              </span>
              <div style={{ flex: 1 }} />
              {step === "prompt" && (
                <button
                  onClick={() => submit()}
                  disabled={!prompt.trim()}
                  style={{
                    padding: "6px 14px",
                    background: prompt.trim() ? ACCENT : "#e2e8f0",
                    color: prompt.trim() ? "white" : "#94a3b8",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    cursor: prompt.trim() ? "pointer" : "default",
                  }}
                >
                  Review plan →
                </button>
              )}
              {step === "plan" && (
                <>
                  <button
                    onClick={() => setStep("prompt")}
                    style={{
                      padding: "6px 12px",
                      background: "white",
                      color: "#64748b",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      border: "1px solid #e2e8f0",
                      cursor: "pointer",
                    }}
                  >
                    ← Edit prompt
                  </button>
                  <button
                    onClick={runAnalysis}
                    disabled={plan.length === 0}
                    style={{
                      padding: "6px 14px",
                      background: plan.length ? ACCENT : "#e2e8f0",
                      color: plan.length ? "white" : "#94a3b8",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      border: "none",
                      cursor: plan.length ? "pointer" : "default",
                    }}
                  >
                    Run analysis →
                  </button>
                </>
              )}
              {step === "running" && (
                <button
                  onClick={() => {
                    clearStreams();
                    onClose();
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "white",
                    color: "#64748b",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    border: "1px solid #e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  Stop and close
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Recap({ prompt }: { prompt: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "#f1f5f9",
        borderRadius: 6,
        marginBottom: 14,
        fontSize: 12,
        color: "#334155",
        lineHeight: 1.5,
        borderLeft: `3px solid ${ACCENT}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          marginBottom: 3,
          letterSpacing: "0.06em",
        }}
      >
        Your request
      </div>
      {prompt}
    </div>
  );
}
