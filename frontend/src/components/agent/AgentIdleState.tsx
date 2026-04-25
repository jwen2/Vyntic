"use client";

import { useEffect, useRef } from "react";
import { ACCENT } from "@/components/dd/types";

const SUGGESTED_PROMPTS = [
  {
    label: "Find all red flags and deal-breakers not already surfaced",
    prompt: "Find all red flags and deal-breakers across every document in this deal room. Focus on anything that could affect valuation or close probability.",
  },
  {
    label: "Cross-validate revenue figures across CIM, QoE, and Financials",
    prompt: "Cross-validate all revenue and EBITDA figures across the CIM, QoE report, and financial statements. Flag any discrepancies and explain their implications.",
  },
  {
    label: "Deep-scan Legal DD for undisclosed litigation or IP risks",
    prompt: "Perform a deep scan of the Legal DD document. Identify all litigation exposure, IP risks, regulatory concerns, and undisclosed liabilities.",
  },
  {
    label: "Identify concentration risks (customer, supplier, key person)",
    prompt: "Identify concentration risks across customers, suppliers, and key employees. Quantify exposure and highlight renewal, retention, or continuity risks.",
  },
];

interface Props {
  dealName: string;
  totalPages: number;
  documentCount: number;
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: (prompt?: string) => void;
}

export default function AgentIdleState({ dealName, totalPages, documentCount, prompt, setPrompt, onSubmit }: Props) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "60px 20px 40px",
    }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 14px",
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: 99,
            marginBottom: 20,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Agent ready · {dealName}</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, marginBottom: 10 }}>
            What do you want to investigate?
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
            Describe what you&apos;re looking for. The agent will autonomously scan all {totalPages} pages across {documentCount} documents, cross-reference findings, and surface cited evidence.
          </p>
        </div>

        <div style={{
          background: "white",
          border: "1.5px solid #e2e8f0",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
          marginBottom: 24,
        }}>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="e.g. Find all red flags and deal-breakers across every document in this deal room..."
            rows={4}
            style={{
              width: "100%",
              padding: "16px 18px",
              fontSize: 14,
              color: "#1e293b",
              border: "none",
              outline: "none",
              resize: "none",
              lineHeight: 1.6,
              background: "transparent",
            }}
          />
          <div style={{ padding: "10px 14px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Enter to run · Shift+Enter for new line</span>
            <button
              onClick={() => onSubmit()}
              disabled={!prompt.trim()}
              style={{
                padding: "7px 18px",
                background: prompt.trim() ? ACCENT : "#e2e8f0",
                color: prompt.trim() ? "white" : "#94a3b8",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: prompt.trim() ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
              Run Analysis
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
          Suggested
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {SUGGESTED_PROMPTS.map((item) => (
            <button
              key={item.label}
              onClick={() => onSubmit(item.prompt)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#2563eb33";
                e.currentTarget.style.background = "#f8faff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.background = "white";
              }}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                cursor: "pointer",
                transition: "all .12s",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", lineHeight: 1.45 }}>{item.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
