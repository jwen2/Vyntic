"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import { listDocuments, type Citation, type DocumentMetadata } from "@/lib/api";
import {
  approveStage,
  cancelRun,
  getRun,
  subscribeRun,
  type AssistantStageOutput,
  type RunStreamEvent,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import DocumentViewer from "@/components/DocumentViewer";
import { ACCENT, AMBER, GREEN, RED, tint } from "./theme";

type Theme = "light" | "dark";

interface AssistantRunProps {
  dealId: string;
  runId: string;
  workflow: Workflow;
  theme: Theme;
  onBack: () => void;
  /** Called once when the run reaches `complete` so the caller can flip to memo view. */
  onComplete?: () => void;
}

interface ViewerState {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
}

export default function AssistantRun({
  dealId,
  runId,
  workflow,
  theme,
  onBack,
  onComplete,
}: AssistantRunProps) {
  const c = ddTheme(theme);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [stages, setStages] = useState<Map<string, AssistantStageOutput>>(new Map());
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  /** Map<stage_output_id, edited_md_draft> for unsaved edits at the checkpoint. */
  const [editDrafts, setEditDrafts] = useState<Map<string, string>>(new Map());
  /** Stage output id currently being approved (for spinner state). */
  const [approving, setApproving] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const completedFiredRef = useRef(false);
  onCompleteRef.current = onComplete;

  const handleCitationClick = useCallback((citation: Citation, citDealId: string) => {
    setViewerState({
      dealId: citDealId,
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
  }, []);

  // Initial document load (for the input-docs sidebar)
  useEffect(() => {
    let active = true;
    listDocuments(dealId)
      .then((items) => {
        if (active) setDocs(items);
      })
      .catch(() => {
        if (active) setDocs([]);
      });
    return () => {
      active = false;
    };
  }, [dealId]);

  // Initial run snapshot (REST), in case SSE snapshot is delayed.
  useEffect(() => {
    let active = true;
    getRun(runId)
      .then((r) => {
        if (!active) return;
        setRun(r);
        setStages((prev) => {
          const next = new Map(prev);
          for (const s of r.stage_outputs) next.set(s.id, s);
          return next;
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load run");
      });
    return () => {
      active = false;
    };
  }, [runId]);

  // SSE subscription
  useEffect(() => {
    const handleEvent = (event: RunStreamEvent) => {
      if (event.type === "snapshot") {
        setRun(event.run);
        setStages((prev) => {
          const next = new Map(prev);
          for (const s of event.run.stage_outputs) next.set(s.id, s);
          return next;
        });
      } else if (event.type === "stage") {
        setStages((prev) => {
          const next = new Map(prev);
          next.set(event.stage.id, event.stage);
          return next;
        });
      } else if (event.type === "run") {
        setRun((prev) => (prev ? { ...prev, status: event.status } : prev));
        if (event.status === "complete" && !completedFiredRef.current) {
          completedFiredRef.current = true;
          onCompleteRef.current?.();
        }
      }
    };

    const close = subscribeRun(runId, handleEvent, () => {
      // EventSource auto-reconnects; we'll re-snapshot via the GET on remount.
    });
    return close;
  }, [runId]);

  // If the run is already complete on initial REST snapshot (e.g. user
  // navigated back to a finished assistant run), fire onComplete too.
  useEffect(() => {
    if (run?.status === "complete" && !completedFiredRef.current) {
      completedFiredRef.current = true;
      onCompleteRef.current?.();
    }
  }, [run?.status]);

  const orderedStages = useMemo(() => {
    return Array.from(stages.values()).sort((a, b) => a.order_index - b.order_index);
  }, [stages]);

  const focusedStage = useMemo(() => {
    // Focus the active checkpoint or running stage; fall back to last
    // completed; otherwise null.
    return (
      orderedStages.find((s) => s.status === "checkpoint") ??
      orderedStages.find((s) => s.status === "running") ??
      orderedStages.find((s) => s.status === "error") ??
      [...orderedStages].reverse().find((s) => s.status === "complete") ??
      null
    );
  }, [orderedStages]);

  const handleCancel = useCallback(async () => {
    if (!run || cancelling) return;
    setCancelling(true);
    try {
      const next = await cancelRun(runId);
      setRun(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel run");
    } finally {
      setCancelling(false);
    }
  }, [run, runId, cancelling]);

  const handleApprove = useCallback(
    async (stage: AssistantStageOutput) => {
      const draft = editDrafts.get(stage.id);
      const editedMd = draft !== undefined && draft !== stage.output_md ? draft : undefined;
      setApproving(stage.id);
      try {
        await approveStage(runId, stage.id, editedMd);
        // The SSE will deliver the updated stage + run-status events; clear the draft.
        setEditDrafts((prev) => {
          const next = new Map(prev);
          next.delete(stage.id);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve stage");
      } finally {
        setApproving(null);
      }
    },
    [runId, editDrafts]
  );

  const setDraft = useCallback((stageId: string, md: string) => {
    setEditDrafts((prev) => {
      const next = new Map(prev);
      next.set(stageId, md);
      return next;
    });
  }, []);

  const runStatus = run?.status ?? "pending";
  const statusPill = pillProps(runStatus);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: c.bg,
        color: c.t1,
      }}
    >
      {/* Top crumb / status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 24px",
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: c.t3,
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← {workflow.name}
        </button>
        <span style={{ color: c.t4 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          Run #{run?.run_number ?? "—"}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 9px",
            borderRadius: 999,
            border: `1px solid ${statusPill.border}`,
            background: statusPill.bg,
            color: statusPill.fg,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusPill.fg,
            }}
          />
          {statusPill.label}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: c.t3, fontFamily: "var(--font-mono, monospace)" }}>
          {summaryLine(orderedStages)}
        </span>
        {(runStatus === "running" || runStatus === "checkpoint" || runStatus === "pending") && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              padding: "5px 12px",
              background: c.surfaceAlt,
              color: c.t1,
              border: `1px solid ${c.border}`,
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 600,
              cursor: cancelling ? "wait" : "pointer",
            }}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "8px 24px",
            background: tint(RED, 10),
            borderBottom: `1px solid ${tint(RED, 30)}`,
            color: RED,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left: stage progress rail + input docs */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: `1px solid ${c.border}`,
            background: c.surfaceAlt,
            padding: 16,
            overflowY: "auto",
          }}
        >
          <SectionLabel theme={theme}>Stages</SectionLabel>
          {orderedStages.map((stage, i) => (
            <StageRailItem
              key={stage.id}
              stage={stage}
              theme={theme}
              isLast={i === orderedStages.length - 1}
              isFocused={focusedStage?.id === stage.id}
            />
          ))}

          <div style={{ marginTop: 24 }}>
            <SectionLabel theme={theme}>Input Docs ({run?.document_ids.length ?? 0})</SectionLabel>
            {(run?.document_ids ?? []).map((docId) => {
              const doc = docs.find((d) => d.doc_id === docId);
              const label = doc?.filename ?? docId.slice(0, 8);
              return (
                <div
                  key={docId}
                  style={{
                    fontSize: 11,
                    color: c.t2,
                    padding: "4px 0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={label}
                >
                  📄 {label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: focused stage output (editable at checkpoint) */}
        <div
          style={{
            flex: 1,
            padding: "20px 28px",
            overflowY: "auto",
            minWidth: 0,
          }}
        >
          {focusedStage ? (
            <StageDetail
              stage={focusedStage}
              draft={editDrafts.get(focusedStage.id)}
              setDraft={setDraft}
              onApprove={() => handleApprove(focusedStage)}
              approving={approving === focusedStage.id}
              theme={theme}
              onCitationClick={(cite) => handleCitationClick(cite, dealId)}
            />
          ) : (
            <div style={{ color: c.t3, fontSize: 12 }}>
              {runStatus === "pending"
                ? "Run is starting…"
                : "Waiting for the first stage to begin."}
            </div>
          )}

          {/* Completed stages below the focus, read-only */}
          {orderedStages
            .filter((s) => s.id !== focusedStage?.id && s.status === "complete")
            .map((s) => (
              <CompletedStageBlock
                key={s.id}
                stage={s}
                theme={theme}
                onCitationClick={(cite) => handleCitationClick(cite, dealId)}
              />
            ))}
        </div>
      </div>

      {viewerState && (
        <DocumentViewer
          dealId={viewerState.dealId}
          filename={viewerState.filename}
          page={viewerState.page}
          snippet={viewerState.snippet}
          onClose={() => setViewerState(null)}
        />
      )}
    </div>
  );
}

// ── Subcomponents ──

function SectionLabel({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: c.t3,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function StageRailItem({
  stage,
  theme,
  isLast,
  isFocused,
}: {
  stage: AssistantStageOutput;
  theme: Theme;
  isLast: boolean;
  isFocused: boolean;
}) {
  const c = ddTheme(theme);
  const dotProps = stageDotProps(stage.status);
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          marginBottom: 2,
          borderRadius: 8,
          background: isFocused ? c.surface : "transparent",
          border: isFocused ? `1px solid ${dotProps.color}40` : "1px solid transparent",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            background: tint(dotProps.color, 20),
            color: dotProps.color,
          }}
        >
          {dotProps.glyph ?? stage.order_index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: stage.status === "queued" ? c.t4 : c.t1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={stage.label}
          >
            {stage.label}
          </div>
          {stage.status === "complete" && stage.duration_ms > 0 && (
            <div
              style={{
                fontSize: 9,
                color: c.t3,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {formatDuration(stage.duration_ms)}
            </div>
          )}
          {stage.status === "checkpoint" && (
            <div style={{ fontSize: 9, color: AMBER, fontWeight: 600 }}>
              Awaiting review
            </div>
          )}
          {stage.status === "running" && (
            <div style={{ fontSize: 9, color: ACCENT, fontWeight: 600 }}>Running…</div>
          )}
          {stage.status === "error" && stage.error_message && (
            <div
              style={{ fontSize: 9, color: RED, overflow: "hidden", textOverflow: "ellipsis" }}
              title={stage.error_message}
            >
              {stage.error_message.slice(0, 40)}
              {stage.error_message.length > 40 ? "…" : ""}
            </div>
          )}
        </div>
      </div>
      {!isLast && <div style={{ width: 1, height: 12, background: c.border, marginLeft: 21 }} />}
    </>
  );
}

function StageDetail({
  stage,
  draft,
  setDraft,
  onApprove,
  approving,
  theme,
  onCitationClick,
}: {
  stage: AssistantStageOutput;
  draft: string | undefined;
  setDraft: (stageId: string, md: string) => void;
  onApprove: () => void;
  approving: boolean;
  theme: Theme;
  onCitationClick: (cite: Citation) => void;
}) {
  const c = ddTheme(theme);
  const isCheckpoint = stage.status === "checkpoint";
  const value = draft !== undefined ? draft : (stage.edited_md ?? stage.output_md);
  const editable = isCheckpoint;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Checkpoint banner */}
      {isCheckpoint && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            marginBottom: 18,
            background: tint(AMBER, 10),
            border: `1px solid ${tint(AMBER, 30)}`,
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 16 }}>⏸</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: AMBER }}>
              Checkpoint — review Stage {stage.order_index} output
            </div>
            <div style={{ fontSize: 11, color: c.t2 }}>
              Edit the markdown below if needed, then approve to continue.
            </div>
          </div>
          <button
            onClick={onApprove}
            disabled={approving}
            style={{
              padding: "7px 14px",
              background: AMBER,
              color: "#1f1300",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: approving ? "wait" : "pointer",
            }}
          >
            {approving ? "Approving…" : "Approve & Continue →"}
          </button>
        </div>
      )}

      {/* Stage header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: c.t1 }}>
          Stage {stage.order_index}: {stage.label}
        </span>
        {stage.status === "running" && (
          <span style={{ fontSize: 11, color: ACCENT }}>● Generating…</span>
        )}
        {stage.status === "error" && stage.error_message && (
          <span style={{ fontSize: 11, color: RED }}>● {stage.error_message}</span>
        )}
      </div>

      {/* Output area */}
      {stage.status === "running" && stage.output_md.length === 0 ? (
        <div
          style={{
            padding: "16px 18px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            color: c.t3,
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          Waiting for output…
        </div>
      ) : editable ? (
        <textarea
          value={value}
          onChange={(e) => setDraft(stage.id, e.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: 280,
            padding: "12px 14px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderLeft: `3px solid ${tint(ACCENT, 50)}`,
            borderRadius: 8,
            fontSize: 12.5,
            color: c.t1,
            lineHeight: 1.7,
            fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
            resize: "vertical",
            outline: "none",
          }}
        />
      ) : (
        <pre
          style={{
            margin: 0,
            padding: "12px 14px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderLeft: `3px solid ${tint(ACCENT, 30)}`,
            borderRadius: 8,
            fontSize: 12.5,
            color: c.t1,
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "inherit",
          }}
        >
          {value || (stage.status === "queued" ? "(queued)" : "")}
        </pre>
      )}

      {/* Citations */}
      <CitationList stage={stage} theme={theme} onCitationClick={onCitationClick} />
    </div>
  );
}

function CompletedStageBlock({
  stage,
  theme,
  onCitationClick,
}: {
  stage: AssistantStageOutput;
  theme: Theme;
  onCitationClick: (cite: Citation) => void;
}) {
  const c = ddTheme(theme);
  return (
    <details style={{ marginBottom: 14 }}>
      <summary
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: c.t2,
          cursor: "pointer",
          padding: "6px 0",
        }}
      >
        ✓ Stage {stage.order_index}: {stage.label}
        {stage.approved_at && (
          <span style={{ color: c.t4, fontWeight: 400, marginLeft: 8 }}>
            (analyst-approved)
          </span>
        )}
      </summary>
      <pre
        style={{
          margin: "8px 0 0 0",
          padding: "10px 12px",
          background: c.surfaceAlt,
          border: `1px solid ${c.border}`,
          borderRadius: 6,
          fontSize: 12,
          color: c.t1,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "inherit",
        }}
      >
        {stage.edited_md ?? stage.output_md}
      </pre>
      <CitationList stage={stage} theme={theme} onCitationClick={onCitationClick} />
    </details>
  );
}

function CitationList({
  stage,
  theme,
  onCitationClick,
}: {
  stage: AssistantStageOutput;
  theme: Theme;
  onCitationClick: (cite: Citation) => void;
}) {
  const c = ddTheme(theme);
  const realCites = stage.citations.filter(
    (cite): cite is Citation => cite !== null
  );
  if (realCites.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: c.t3,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        Citations ({realCites.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {realCites.map((cite, i) => (
          <button
            key={i}
            onClick={() => onCitationClick(cite)}
            style={{
              textAlign: "left",
              padding: "8px 10px",
              background: c.surfaceAlt,
              border: `1px solid ${c.border}`,
              borderLeft: `3px solid ${ACCENT}`,
              borderRadius: 6,
              cursor: "pointer",
              color: c.t1,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: ACCENT,
                fontFamily: "var(--font-mono, monospace)",
                marginBottom: 4,
              }}
            >
              {cite.source_file} · p.{cite.page}
            </div>
            <div style={{ fontSize: 11, color: c.t2, lineHeight: 1.5, fontStyle: "italic" }}>
              {cite.text_snippet ? `“${cite.text_snippet}”` : "(no snippet)"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── helpers ──

function summaryLine(stages: AssistantStageOutput[]): string {
  const total = stages.length;
  const done = stages.filter((s) => s.status === "complete").length;
  const checkpoint = stages.find((s) => s.status === "checkpoint");
  if (checkpoint) {
    return `Stage ${checkpoint.order_index} of ${total} · awaiting review`;
  }
  const running = stages.find((s) => s.status === "running");
  if (running) return `Stage ${running.order_index} of ${total} · generating`;
  return `${done} of ${total} stages complete`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m ${rs}s`;
}

function pillProps(status: WorkflowRun["status"]): {
  label: string;
  fg: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case "running":
      return { label: "Running", fg: ACCENT, bg: tint(ACCENT, 15), border: tint(ACCENT, 30) };
    case "checkpoint":
      return { label: "Checkpoint", fg: AMBER, bg: tint(AMBER, 15), border: tint(AMBER, 30) };
    case "complete":
      return { label: "Complete", fg: GREEN, bg: tint(GREEN, 15), border: tint(GREEN, 30) };
    case "cancelled":
      return { label: "Cancelled", fg: "#777", bg: tint("#777777", 15), border: tint("#777777", 30) };
    case "error":
      return { label: "Error", fg: RED, bg: tint(RED, 15), border: tint(RED, 30) };
    default:
      return { label: "Pending", fg: "#777", bg: tint("#777777", 10), border: tint("#777777", 30) };
  }
}

function stageDotProps(status: AssistantStageOutput["status"]): {
  color: string;
  glyph: string | null;
} {
  switch (status) {
    case "complete":
      return { color: GREEN, glyph: "✓" };
    case "running":
      return { color: ACCENT, glyph: "●" };
    case "checkpoint":
      return { color: AMBER, glyph: "⏸" };
    case "error":
      return { color: RED, glyph: "!" };
    default:
      return { color: "#777", glyph: null };
  }
}
