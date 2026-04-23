"use client";
import { useMemo } from "react";
import type { Citation } from "@/lib/api";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import { fixMarkdownTables } from "@/lib/markdownUtils";
import { SEV_COLOR, ACCENT } from "./types";
import type { FindingSeverity } from "./types";
import AnswerText, { CitBadge } from "./AnswerText";

interface Props {
  qid: string;
  label: string;
  result?: QuestionResult;
  severity?: FindingSeverity;
  open: boolean;
  onToggle: () => void;
  onRun: () => void;
  activeCitId: string | null;
  onCit: (c: Citation, id: string) => void;
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Rough confidence heuristic until the backend returns one:
 * - complete & cited → 85
 * - complete & uncited → 55
 * - loading → 60
 * - error → 0
 */
function estimateConfidence(r?: QuestionResult): number {
  if (!r || r.status === "pending") return 0;
  if (r.status === "error") return 0;
  if (r.status === "loading") return 60;
  const citedCount = (r.citations || []).filter((c) => c !== null).length;
  return citedCount > 0 ? 88 : 55;
}

export default function QCard({
  qid: _qid,
  label,
  result,
  severity,
  open,
  onToggle,
  onRun,
  activeCitId,
  onCit,
}: Props) {
  const status = result?.status ?? "pending";
  const isPending = status === "pending" || !result;
  const isLoading = status === "loading";
  const isError = status === "error";

  const conf = useMemo(() => estimateConfidence(result), [result]);
  const citations = result?.citations || [];
  const nonNullCits = citations.filter((c): c is Citation => c !== null);

  const cleanAnswer = useMemo(
    () => (result?.answer ? fixMarkdownTables(stripThinkTags(result.answer)) : ""),
    [result?.answer]
  );

  const statusDot = severity ? SEV_COLOR[severity].dot : "#22c55e";

  return (
    <div style={{ borderBottom: "1px solid #f1f5f9" }}>
      {/* Header row */}
      <div
        onClick={() => !isPending && onToggle()}
        className="flex items-center gap-2.5"
        onMouseEnter={(e) => {
          if (!isPending) e.currentTarget.style.background = "#fafafa";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "white";
        }}
        style={{
          padding: "11px 20px",
          cursor: isPending ? "default" : "pointer",
          background: "white",
          transition: "background .1s",
        }}
      >
        {/* Status icon */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isPending
              ? "transparent"
              : isError
              ? "#fee2e2"
              : isLoading
              ? "#dbeafe"
              : severity
              ? `${statusDot}22`
              : "#dcfce7",
            border: isPending ? "2px solid #e2e8f0" : "none",
          }}
        >
          {isPending ? null : isError ? (
            <span style={{ color: "#dc2626", fontSize: 10, fontWeight: 700 }}>!</span>
          ) : isLoading ? (
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
          ) : severity ? (
            <span
              style={{ width: 7, height: 7, borderRadius: "50%", background: statusDot }}
            />
          ) : (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.5" strokeLinecap="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: isPending ? "#94a3b8" : "#1e293b",
            }}
          >
            {label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!isPending && severity && (
            <span
              className="flex items-center gap-1"
              style={{
                padding: "1px 5px",
                borderRadius: 99,
                background: SEV_COLOR[severity].bg,
                border: `1px solid ${SEV_COLOR[severity].border}`,
                fontSize: 10,
                fontWeight: 600,
                color: SEV_COLOR[severity].color,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: SEV_COLOR[severity].dot,
                }}
              />
              {SEV_COLOR[severity].label}
            </span>
          )}
          {!isPending && !isError && !isLoading && (
            <ConfBar pct={conf} />
          )}
          {!isPending && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {nonNullCits.length} src
            </span>
          )}
          {isPending ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRun();
              }}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                background: ACCENT,
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Run
            </button>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              style={{
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform .2s",
                flexShrink: 0,
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </div>
      </div>

      {open && !isPending && (
        <div
          className="dd-fade-in"
          style={{
            padding: "12px 20px 18px 48px",
            background: "#fafafa",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          {/* Analysis header */}
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              AI Analysis
            </span>
            {!isError && (
              <>
                <span style={{ fontSize: 10, color: "#e2e8f0" }}>·</span>
                <ConfBar pct={conf} />
                <span style={{ fontSize: 10, color: "#94a3b8" }}>confidence</span>
              </>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRun();
              }}
              style={{
                fontSize: 11,
                color: "#64748b",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {isLoading ? "Running..." : "Re-run"}
            </button>
          </div>

          {/* Body */}
          <div style={{ fontSize: 13, color: "#334155", fontFamily: "'DM Sans', sans-serif" }}>
            {isError ? (
              <div style={{ color: "#dc2626" }}>{result?.answer || "Error generating answer."}</div>
            ) : cleanAnswer ? (
              <AnswerText
                text={cleanAnswer}
                citations={citations}
                activeCitId={activeCitId}
                onCit={onCit}
              />
            ) : isLoading ? (
              <span style={{ color: "#94a3b8" }}>Analyzing...</span>
            ) : (
              <span style={{ color: "#94a3b8" }}>No content yet.</span>
            )}
          </div>

          {/* Sources footer */}
          {nonNullCits.length > 0 && (
            <div
              className="flex items-center gap-1.5 flex-wrap"
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Sources</span>
              {nonNullCits.map((c, i) => {
                const id = `${c.source_file}_p${c.page}_${i}`;
                return (
                  <CitBadge
                    key={id}
                    cit={c}
                    id={id}
                    active={activeCitId === id}
                    onClick={() => onCit(c, id)}
                  />
                );
              })}
              <span style={{ fontSize: 10, color: "#b0bec5", marginLeft: 4 }}>
                click to inspect evidence
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "#059669" : pct >= 75 ? "#2563eb" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <span className="inline-flex items-center gap-1">
      <span
        style={{
          width: 40,
          height: 3,
          background: "#e2e8f0",
          borderRadius: 99,
          overflow: "hidden",
          display: "inline-block",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 99,
          }}
        />
      </span>
      <span
        className="font-mono-dm"
        style={{ fontSize: 10, color, fontWeight: 600 }}
      >
        {pct}%
      </span>
    </span>
  );
}
