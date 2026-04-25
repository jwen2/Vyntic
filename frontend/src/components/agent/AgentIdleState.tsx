"use client";

import { useEffect, useRef } from "react";
import { ACCENT, ddTheme } from "@/components/dd/types";
import { useTheme } from "@/components/ThemeProvider";

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
  {
    label: "Find cross-document inconsistencies",
    prompt: "Find cross-document inconsistencies across the CIM, QoE, financials, legal documents, and operations materials. Highlight metric mismatches, contradictory claims, and missing evidence.",
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
  const { theme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";
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
      justifyContent: "center",
      padding: "40px 24px",
      background: c.bg,
    }}>
      <div style={{ width: "100%", maxWidth: 600 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "4px 12px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 99,
            marginBottom: 20,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 12, color: c.t2, fontWeight: 500 }}>Agent ready · {dealName}</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: c.t1, lineHeight: 1.25, marginBottom: 8 }}>
            What do you want to investigate?
          </h1>
          <p style={{ fontSize: 14, color: c.t2, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
            Scan {totalPages} pages across {documentCount} documents. Surface cited evidence.
          </p>
        </div>

        <div style={{
          background: c.surface,
          border: `1.5px solid ${c.border}`,
          borderRadius: 12,
          overflow: "hidden",
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
              padding: "14px 16px",
              fontSize: 14,
              color: c.t1,
              border: "none",
              outline: "none",
              resize: "none",
              lineHeight: 1.6,
              background: "transparent",
            }}
          />
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: c.t3 }}>Enter to run · Shift+Enter for new line</span>
            <button
              onClick={() => onSubmit()}
              disabled={!prompt.trim()}
              style={{
                padding: "6px 16px",
                background: prompt.trim() ? ACCENT : c.border,
                color: prompt.trim() ? "white" : c.t3,
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: prompt.trim() ? "pointer" : "default",
              }}
            >
              Run
            </button>
          </div>
        </div>

        <button
          onClick={() => onSubmit("Run proactive scan across all documents to find hidden risks, buried clauses, and data room gaps.")}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#f59e0b")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = isDark ? "#92400e44" : "#fde68a")}
          className="flex items-center"
          style={{
            width: "100%",
            gap: 12,
            padding: "14px 16px",
            background: isDark ? "#78350f22" : "#fffbeb",
            border: `1px solid ${isDark ? "#92400e44" : "#fde68a"}`,
            borderRadius: 10,
            cursor: "pointer",
            marginBottom: 20,
            textAlign: "left",
            transition: "border-color .12s",
          }}
        >
          <span style={{ width: 36, height: 36, borderRadius: 8, background: isDark ? "#78350f44" : "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🔍</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: c.t1 }}>Run Proactive Scan</span>
            <span style={{ display: "block", fontSize: 12, color: c.t2, marginTop: 1 }}>Sweep all {totalPages} pages to find hidden risks, buried clauses, and data room gaps</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.t3} strokeWidth="2"><path d="M5 3l14 9-14 9V3z" /></svg>
        </button>

        <div style={{ fontSize: 11, fontWeight: 600, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Suggested investigations
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {SUGGESTED_PROMPTS.map((item) => (
            <button
              key={item.label}
              onClick={() => onSubmit(item.prompt)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#2563eb33";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = c.border;
              }}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                cursor: "pointer",
                transition: "all .12s",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: c.t1, lineHeight: 1.45 }}>{item.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
