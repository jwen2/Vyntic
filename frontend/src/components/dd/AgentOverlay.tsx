"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentPhase, AgentPlanTask, Finding } from "./types";
import { ACCENT } from "./types";

interface Props {
  onClose: () => void;
  onComplete: (findings: Finding[]) => void;
  docShortNames: string[];
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

export default function AgentOverlay({ onClose, onComplete, docShortNames: _docShortNames }: Props) {
  const [step, setStep] = useState<AgentPhase>("prompt");
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<AgentPlanTask[]>(DEFAULT_PLAN);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<number[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (step === "prompt") inputRef.current?.focus();
  }, [step]);

  useEffect(() => () => clearTimers(), []);

  function clearTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
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
    setStep("running");
    setProgress(0);
    const total = plan.length;
    plan.forEach((_, i) => {
      timersRef.current.push(
        window.setTimeout(() => setProgress(i + 1), (i + 1) * 650)
      );
    });
    timersRef.current.push(
      window.setTimeout(() => {
        // TODO(P0): wire to real agent investigation endpoint with streaming
        // status instead of simulated timers. For now, we surface a single
        // deterministic placeholder finding so the UX end-state is demo-able.
        const fid = `agent-${Date.now()}`;
        onComplete([
          {
            id: fid,
            sev: "material",
            title: "Supplier concentration risk: 1 vendor = 43% of COGS",
            detail:
              "AWS is sole infrastructure provider. No documented DR plan for regional failure.",
            src: "Ops DD · p.28",
            ws: "operational",
            qid: null,
            conf: 82,
            status: null,
            note: null,
            origin: "agent",
          },
        ]);
        setStep("done");
      }, total * 650 + 300)
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
          maxHeight: "78vh",
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
                <div
                  style={{
                    marginTop: 16,
                    padding: 14,
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#065f46",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    Synthesis
                  </div>
                  <div style={{ fontSize: 12, color: "#064e3b", lineHeight: 1.6, marginBottom: 10 }}>
                    Scanned {plan.length} workstream task{plan.length !== 1 ? "s" : ""} across the
                    deal room. Surfaced <strong>1 new material finding</strong> — supplier
                    concentration risk on infrastructure.
                  </div>
                  <div style={{ fontSize: 11, color: "#065f46" }}>
                    New finding added to <strong>Red Flags → Material</strong> in the sidebar.
                  </div>
                </div>
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
            background: "#f8fafc",
          }}
        >
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {step === "prompt" && "↵ Enter to continue · Shift+Enter for new line"}
            {step === "plan" && "× to remove a task · you can add follow-ups after the run"}
            {step === "running" && `${progress} / ${plan.length} tasks complete`}
            {step === "done" && "Findings synced to workspace"}
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
                clearTimers();
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
              Run in background
            </button>
          )}

          {step === "done" && (
            <button
              onClick={onClose}
              style={{
                padding: "6px 14px",
                background: ACCENT,
                color: "white",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Back to workspace →
            </button>
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
