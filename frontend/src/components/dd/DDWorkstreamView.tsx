"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Citation, WorkstreamEvent } from "@/lib/api";
import { workstreamStream, singleQuestionStream } from "@/lib/api";
import type { Workstream } from "@/lib/queryTemplates";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import { useTheme } from "@/components/ThemeProvider";
import QCard from "./QCard";
import { ACCENT } from "./types";

interface Props {
  dealId: string;
  workstream: Workstream;
  cachedResults: Record<string, QuestionResult>;
  onResultsChange: (results: Record<string, QuestionResult>) => void;
  activeCitId: string | null;
  onCit: (c: Citation, id: string) => void;
}

export default function DDWorkstreamView({
  dealId,
  workstream,
  cachedResults,
  onResultsChange,
  activeCitId,
  onCit,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [results, setResults] = useState<Record<string, QuestionResult>>(cachedResults);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef(results);

  useEffect(() => {
    setResults(cachedResults);
    resultsRef.current = cachedResults;
  }, [workstream.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateResults = useCallback(
    (updater: (prev: Record<string, QuestionResult>) => Record<string, QuestionResult>) => {
      setResults((prev) => {
        const next = updater(prev);
        resultsRef.current = next;
        onResultsChange(next);
        return next;
      });
    },
    [onResultsChange]
  );

  const handleEvent = useCallback(
    (event: WorkstreamEvent) => {
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
        setExpanded((s) => {
          const next = new Set(s);
          next.add(q);
          return next;
        });
      } else if (event.type === "error") {
        updateResults((prev) => ({
          ...prev,
          [q]: { answer: event.error, citations: [], status: "error" },
        }));
      }
    },
    [updateResults]
  );

  const runSingle = useCallback(
    (query: string) => {
      controllerRef.current?.abort();
      updateResults((prev) => ({
        ...prev,
        [query]: { answer: "", citations: [], status: "loading" },
      }));
      setExpanded((s) => {
        const next = new Set(s);
        next.add(query);
        return next;
      });
      controllerRef.current = singleQuestionStream(
        dealId,
        query,
        workstream.id,
        handleEvent,
        undefined,
        (err) => console.error("single question error:", err)
      );
    },
    [dealId, workstream.id, handleEvent, updateResults]
  );

  const runAll = useCallback(() => {
    controllerRef.current?.abort();
    const questions = workstream.templates.map((t) => t.query);
    updateResults((prev) => {
      const next = { ...prev };
      for (const q of questions) next[q] = { answer: "", citations: [], status: "loading" };
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
        console.error("workstream stream error:", err);
        setRunningAll(false);
      }
    );
  }, [dealId, workstream, handleEvent, updateResults]);

  const completed = workstream.templates.filter(
    (t) => results[t.query]?.status === "complete"
  ).length;
  const surface = isDark ? "#0f172a" : "white";
  const border = isDark ? "#1e293b" : "#f1f5f9";
  const heading = isDark ? "#f1f5f9" : "#0f172a";
  const muted = isDark ? "#94a3b8" : "#64748b";
  const subtle = isDark ? "#64748b" : "#94a3b8";

  return (
    <div className="flex flex-col h-full">
      {/* Workstream header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          padding: "14px 20px",
          background: surface,
          borderBottom: `1px solid ${border}`,
        }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: heading }}>
            {workstream.name}
          </h2>
          <p style={{ fontSize: 12, color: muted, marginTop: 2 }}>
            {workstream.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 11, color: subtle }}>
            {completed}/{workstream.templates.length} complete
          </span>
          <button
            onClick={runAll}
            disabled={runningAll}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              background: runningAll ? (isDark ? "#1e293b" : "#e2e8f0") : ACCENT,
              color: runningAll ? subtle : "white",
              borderRadius: 6,
              border: "none",
              cursor: runningAll ? "default" : "pointer",
            }}
          >
            {runningAll ? "Running..." : "Run full workstream"}
          </button>
        </div>
      </div>

      {/* Questions list */}
      <div className="flex-1 overflow-y-auto">
        {workstream.templates.map((t) => {
          const r = results[t.query];
          return (
            <QCard
              key={t.query}
              qid={t.query}
              label={t.label}
              result={r}
              open={expanded.has(t.query)}
              onToggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(t.query)) n.delete(t.query);
                  else n.add(t.query);
                  return n;
                })
              }
              onRun={() => runSingle(t.query)}
              activeCitId={activeCitId}
              onCit={onCit}
            />
          );
        })}

        {/* Custom questions that aren't in templates */}
        {Object.entries(results)
          .filter(([q]) => !workstream.templates.some((t) => t.query === q))
          .map(([query, r]) => (
            <QCard
              key={query}
              qid={query}
              label="Custom question"
              result={r}
              open={expanded.has(query)}
              onToggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(query)) n.delete(query);
                  else n.add(query);
                  return n;
                })
              }
              onRun={() => runSingle(query)}
              activeCitId={activeCitId}
              onCit={onCit}
            />
          ))}

        {workstream.templates.length === 0 && (
          <EmptyWs wsId={workstream.id} onRun={runAll} />
        )}
      </div>
    </div>
  );
}

function EmptyWs({ wsId, onRun }: { wsId: string; onRun: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isLegal = wsId === "legal";
  const muted = isDark ? "#94a3b8" : "#94a3b8";
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ height: "60%", padding: 40 }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: isDark ? "#1e293b" : "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isLegal ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        )}
      </div>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: isLegal ? (isDark ? "#f87171" : "#dc2626") : isDark ? "#cbd5e1" : "#475569",
            marginBottom: 5,
          }}
        >
          {isLegal ? "Legal DD not analyzed — coverage gap" : "Not yet analyzed"}
        </div>
        <div style={{ fontSize: 13, color: muted, maxWidth: 280, lineHeight: 1.6 }}>
          {isLegal
            ? "The Legal DD workstream has no analysis yet. Undisclosed litigation or IP risks may be hiding in these documents."
            : `Run the ${wsId} workstream to generate AI-powered analysis with full source citations.`}
        </div>
      </div>
      <button
        onClick={onRun}
        style={{
          padding: "8px 20px",
          background: isLegal ? "#dc2626" : ACCENT,
          color: "white",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        {isLegal ? "Analyze Legal DD now" : "Run workstream"}
      </button>
    </div>
  );
}
