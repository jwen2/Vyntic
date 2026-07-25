
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listDocuments, type Citation, type DocumentMetadata } from "@/lib/api";
import {
  approveStage,
  cancelRun,
  getRun,
  listRuns,
  subscribeRun,
  type AssistantStageOutput,
  type RunStreamEvent,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import DocumentViewer from "@/components/DocumentViewer";
import AnswerText from "@/components/dd/AnswerText";
import { ACCENT, AMBER, GREEN, RED, tint } from "./theme";

interface AssistantRunProps {
  dealId: string;
  runId: string;
  workflow: Workflow;
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
  onBack,
  onComplete,
}: AssistantRunProps) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [stages, setStages] = useState<Map<string, AssistantStageOutput>>(new Map());
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  /** Map<stage_output_id, edited_md_draft> for unsaved edits at the checkpoint. */
  const [editDrafts, setEditDrafts] = useState<Map<string, string>>(new Map());
  /** Stage output id currently being approved (for spinner state). */
  const [approving, setApproving] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const completedFiredRef = useRef(false);
  onCompleteRef.current = onComplete;

  const handleCitationClick = useCallback((citation: Citation, citDealId: string, id?: string) => {
    if (id) setActiveCitationId(id);
    setViewerState({
      dealId: citDealId,
      filename: citation.source_file,
      page: citation.page,
      snippet: citation.text_snippet || "",
    });
  }, []);

  const applyRunSnapshot = useCallback((nextRun: WorkflowRun) => {
    setRun(nextRun);
    setStages((prev) => {
      const next = new Map(prev);
      for (const s of nextRun.stage_outputs) next.set(s.id, s);
      return next;
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

  useEffect(() => {
    let active = true;
    listRuns(dealId, workflow.id)
      .then((items) => {
        if (active) setRunHistory(items);
      })
      .catch(() => {
        if (active) setRunHistory([]);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflow.id]);

  // Initial run snapshot (REST), in case SSE snapshot is delayed.
  useEffect(() => {
    let active = true;
    getRun(runId)
      .then((r) => {
        if (!active) return;
        applyRunSnapshot(r);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load run");
      });
    return () => {
      active = false;
    };
  }, [runId, applyRunSnapshot]);

  // SSE is the primary realtime channel, but EventSource can miss a transition
  // across reconnects. Poll active assistant runs so checkpoint approvals never
  // leave the UI showing stale stage state.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      if (cancelled) return;
      try {
        const nextRun = await getRun(runId);
        if (!cancelled) applyRunSnapshot(nextRun);
      } catch {
        // Keep the existing SSE/error surface; transient refresh failures should
        // not replace visible workflow output.
      } finally {
        if (!cancelled) timeoutId = setTimeout(refresh, 3000);
      }
    };

    if (!run || run.status === "pending" || run.status === "running" || run.status === "checkpoint") {
      timeoutId = setTimeout(refresh, 3000);
    }
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [run?.status, runId, applyRunSnapshot]);

  // SSE subscription
  useEffect(() => {
    const handleEvent = (event: RunStreamEvent) => {
      if (event.type === "snapshot") {
        applyRunSnapshot(event.run);
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
  }, [runId, applyRunSnapshot]);

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
      setError(null);
      try {
        const approved = await approveStage(runId, stage.id, editedMd);
        setStages((prev) => {
          const next = new Map(prev);
          next.set(approved.id, approved);
          return next;
        });
        setRun((prev) => (prev ? { ...prev, status: "running" } : prev));
        setEditDrafts((prev) => {
          const next = new Map(prev);
          next.delete(stage.id);
          return next;
        });
        try {
          applyRunSnapshot(await getRun(runId));
        } catch {
          // Polling/SSE will catch the next transition.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve stage");
      } finally {
        setApproving(null);
      }
    },
    [runId, editDrafts, applyRunSnapshot]
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
      className="bg-appbg text-t1"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Top crumb / status bar */}
      <div
        className="border-b border-b-edge"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 24px",
        }}
      >
        <button
          onClick={onBack}
          className="text-t3"
          style={{
            background: "transparent",
            border: "none",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← {workflow.name}
        </button>
        <span className="text-t4">›</span>
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
        <span className="text-t3" style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)" }}>
          {summaryLine(orderedStages)}
        </span>
        {(runStatus === "running" || runStatus === "checkpoint" || runStatus === "pending") && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="border border-edge bg-surface-alt text-t1"
            style={{
              padding: "5px 12px",
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
          className="border-r border-r-edge bg-surface-alt"
          style={{
            width: 220,
            flexShrink: 0,
            padding: 16,
            overflowY: "auto",
          }}
        >
          <SectionLabel>Stages</SectionLabel>
          {orderedStages.map((stage, i) => (
            <StageRailItem
              key={stage.id}
              stage={stage}
              isLast={i === orderedStages.length - 1}
              isFocused={focusedStage?.id === stage.id}
            />
          ))}

          <div style={{ marginTop: 24 }}>
            <SectionLabel>Input Docs ({run?.document_ids.length ?? 0})</SectionLabel>
            {(run?.document_ids ?? []).map((docId) => {
              const doc = docs.find((d) => d.doc_id === docId);
              const label = doc?.filename ?? docId.slice(0, 8);
              return (
                <div
                  key={docId}
                  className="text-t2"
                  style={{
                    fontSize: 11,
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
              activeCitationId={activeCitationId}
              onCitationClick={(cite, id) => handleCitationClick(cite, dealId, id)}
            />
          ) : (
            <div className="text-t3" style={{ fontSize: 12 }}>
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
                activeCitationId={activeCitationId}
                onCitationClick={(cite, id) => handleCitationClick(cite, dealId, id)}
              />
            ))}
        </div>

        <AssistantSourceSidebar
          run={run}
          runHistory={runHistory}
          stage={focusedStage}
          dealId={dealId}
          activeCitationId={activeCitationId}
          onCitationClick={handleCitationClick}
        />
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-t3"
      style={{
        fontSize: 10,
        fontWeight: 700,
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
  isLast,
  isFocused,
}: {
  stage: AssistantStageOutput;
  isLast: boolean;
  isFocused: boolean;
}) {
  const dotProps = stageDotProps(stage.status);
  return (
    <>
      <div
        // Focused-state border derives from the stage's status hue, not a
        // token, so background/border stay inline together.
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          marginBottom: 2,
          borderRadius: 8,
          background: isFocused ? "var(--surface)" : "transparent",
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
            className={stage.status === "queued" ? "text-t4" : "text-t1"}
            style={{
              fontSize: 11,
              fontWeight: 500,
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
              className="text-t3"
              style={{
                fontSize: 9,
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
      {!isLast && <div className="bg-edge" style={{ width: 1, height: 12, marginLeft: 21 }} />}
    </>
  );
}

function StageDetail({
  stage,
  draft,
  setDraft,
  onApprove,
  approving,
  activeCitationId,
  onCitationClick,
}: {
  stage: AssistantStageOutput;
  draft: string | undefined;
  setDraft: (stageId: string, md: string) => void;
  onApprove: () => void;
  approving: boolean;
  activeCitationId: string | null;
  onCitationClick: (cite: Citation, id: string) => void;
}) {
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
            <div className="text-t2" style={{ fontSize: 11 }}>
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
        <span className="text-t1" style={{ fontSize: 14, fontWeight: 700 }}>
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
          className="bg-surface border border-edge text-t3"
          style={{
            padding: "16px 18px",
            borderRadius: 8,
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          Waiting for output…
        </div>
      ) : editable ? (
        <>
          <AssistantOutputText
            text={value || ""}
            citations={stage.citations}
            activeCitationId={activeCitationId}
            onCitationClick={onCitationClick}
          />
          <details style={{ marginTop: 12 }}>
            <summary className="text-t3" style={{ fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Edit markdown
            </summary>
            <textarea
              value={value}
              onChange={(e) => setDraft(stage.id, e.target.value)}
              spellCheck={false}
              className="bg-surface border border-edge text-t1"
              style={{
                width: "100%",
                minHeight: 220,
                marginTop: 8,
                padding: "12px 14px",
                borderLeft: `3px solid ${tint(ACCENT, 50)}`,
                borderRadius: 8,
                fontSize: 12.5,
                lineHeight: 1.7,
                fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                resize: "vertical",
                outline: "none",
              }}
            />
          </details>
        </>
      ) : (
        <AssistantOutputText
          text={value || (stage.status === "queued" ? "(queued)" : "")}
          citations={stage.citations}
          activeCitationId={activeCitationId}
          onCitationClick={onCitationClick}
        />
      )}
    </div>
  );
}

function CompletedStageBlock({
  stage,
  activeCitationId,
  onCitationClick,
}: {
  stage: AssistantStageOutput;
  activeCitationId: string | null;
  onCitationClick: (cite: Citation, id: string) => void;
}) {
  return (
    <details style={{ marginBottom: 14 }}>
      <summary
        className="text-t2"
        style={{
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          padding: "6px 0",
        }}
      >
        ✓ Stage {stage.order_index}: {stage.label}
        {stage.approved_at && (
          <span className="text-t4" style={{ fontWeight: 400, marginLeft: 8 }}>
            (analyst-approved)
          </span>
        )}
      </summary>
      <AssistantOutputText
        text={stage.edited_md ?? stage.output_md}
        citations={stage.citations}
        activeCitationId={activeCitationId}
        onCitationClick={onCitationClick}
        muted
      />
    </details>
  );
}

function AssistantOutputText({
  text,
  citations,
  activeCitationId,
  onCitationClick,
  muted = false,
}: {
  text: string;
  citations: (Citation | null)[];
  activeCitationId: string | null;
  onCitationClick: (cite: Citation, id: string) => void;
  muted?: boolean;
}) {
  return (
    <div
      className={`border border-edge text-t1 ${muted ? "bg-surface-alt" : "bg-surface"}`}
      style={{
        margin: muted ? "8px 0 0 0" : 0,
        padding: muted ? "10px 12px" : "12px 14px",
        borderLeft: `3px solid ${tint(ACCENT, muted ? 24 : 35)}`,
        borderRadius: muted ? 6 : 8,
        fontSize: 12.5,
      }}
    >
      <AnswerText
        text={text}
        citations={citations}
        activeCitId={activeCitationId}
        onCit={onCitationClick}
      />
    </div>
  );
}

function AssistantSourceSidebar({
  stage,
  run,
  runHistory,
  dealId,
  onCitationClick,
}: {
  stage: AssistantStageOutput | null;
  run: WorkflowRun | null;
  runHistory: WorkflowRun[];
  dealId: string;
  activeCitationId: string | null;
  onCitationClick: (cite: Citation, dealId: string, id?: string) => void;
}) {
  const realCites = (stage?.citations ?? []).filter(
    (cite): cite is Citation => cite !== null
  );
  return (
    <aside
      className="border-l border-l-edge bg-surface-alt"
      style={{
        width: 320,
        flexShrink: 0,
        overflowY: "auto",
        padding: 16,
      }}
    >
      <SectionLabel>Sources Cited</SectionLabel>
      <div
        className="bg-surface"
        // A focused stage tints the panel's edge with the accent, not a
        // token, so the border overrides the class inline (as in DS1/DS2's
        // PositionModal/RunDetailPanel).
        style={{
          padding: "12px 14px",
          border: `1px solid ${stage ? tint(ACCENT, 35) : "var(--border)"}`,
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        {stage ? (
          <>
            <div className="text-t3" style={{ fontSize: 10, marginBottom: 8 }}>
              Stage {stage.order_index}: {stage.label}
            </div>
            <div className="text-t3" style={{ fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
              Citations ({realCites.length})
            </div>
            {realCites.length ? (
              realCites.map((cite, i) => (
                <button
                  key={`${cite.source_file}-${cite.page}-${i}`}
                  onClick={() => onCitationClick(cite, cite.deal_id || dealId, workflowCitationId(cite, i))}
                  className="bg-appbg"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderLeft: `3px solid ${ACCENT}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    marginBottom: 7,
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
                  <div className="text-t2" style={{ fontSize: 11, lineHeight: 1.5, fontStyle: "italic" }}>
                    {cite.text_snippet || "Open source passage"}
                  </div>
                </button>
              ))
            ) : (
              <div className="text-t3" style={{ fontSize: 11, lineHeight: 1.5 }}>
                No valid source markers were captured for this stage.
              </div>
            )}
            {realCites[0] && (
              <button
                onClick={() => onCitationClick(realCites[0], realCites[0].deal_id || dealId, workflowCitationId(realCites[0], 0))}
                className="border border-edge bg-surface-alt text-t1"
                style={{
                  marginTop: 4,
                  padding: "6px 10px",
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Open in Viewer
              </button>
            )}
          </>
        ) : (
          <div className="text-t3" style={{ fontSize: 12 }}>No active stage yet.</div>
        )}
      </div>

      <SectionLabel>Run History</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {runHistory.slice(0, 6).map((item) => {
          const current = item.id === run?.id;
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between px-[10px] py-2 rounded-md border ${
                current ? "bg-surface border-edge" : "bg-transparent border-transparent"
              }`}
            >
              <span
                className={`text-[11px] ${current ? "font-bold text-t1" : "font-medium text-t3"}`}
              >
                Run #{item.run_number}
              </span>
              <span className="text-t3" style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)" }}>
                {formatRunDate(item.started_at)}
              </span>
            </div>
          );
        })}
        {runHistory.length === 0 && <div className="text-t3" style={{ fontSize: 11 }}>No prior runs.</div>}
      </div>
    </aside>
  );
}

function workflowCitationId(citation: Citation, index: number): string {
  return `${citation.source_file}_p${citation.page}_${index}`;
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

function formatRunDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
