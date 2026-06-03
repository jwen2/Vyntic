"use client";

import { useEffect, useMemo, useState } from "react";
import { ddTheme } from "@/components/dd/types";
import { listDocuments, type Citation, type DocumentMetadata } from "@/lib/api";
import {
  downloadRunExport,
  getRun,
  type AssistantStageOutput,
  type Workflow,
  type WorkflowRun,
} from "@/lib/workflows";
import DocumentViewer from "@/components/DocumentViewer";
import AnswerText from "@/components/dd/AnswerText";
import { ACCENT, GREEN, RED, tint } from "./theme";

type Theme = "light" | "dark";

interface MemoOutputProps {
  dealId: string;
  runId: string;
  workflow: Workflow;
  theme: Theme;
  onBack: () => void;
}

interface ViewerState {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
}

export default function MemoOutput({
  dealId,
  runId,
  workflow,
  theme,
  onBack,
}: MemoOutputProps) {
  const c = ddTheme(theme);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [docs, setDocs] = useState<DocumentMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    getRun(runId)
      .then((r) => {
        if (active) setRun(r);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load run");
      });
    return () => {
      active = false;
    };
  }, [runId]);

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

  const stages = useMemo(() => {
    if (!run) return [];
    return [...run.stage_outputs].sort((a, b) => a.order_index - b.order_index);
  }, [run]);
  const outputLabel = workflow.output_format === "word" ? "Memo Output" : "Extraction Output";
  const generatedLabel = workflow.output_format === "word" ? "Generated memo" : "Extracted findings";

  // Citation tally per source document.
  const citesByDoc = useMemo(() => {
    const map = new Map<string, number>();
    stages.forEach((s) => {
      s.citations.forEach((cite) => {
        if (!cite) return;
        map.set(cite.source_file, (map.get(cite.source_file) ?? 0) + 1);
      });
    });
    return map;
  }, [stages]);

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: RED,
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }

  if (!run) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.t2,
          fontSize: 12,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
          Run #{run.run_number} — {outputLabel}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 9px",
            borderRadius: 999,
            border: `1px solid ${tint(GREEN, 30)}`,
            background: tint(GREEN, 15),
            color: GREEN,
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
              background: GREEN,
            }}
          />
          Complete
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={async () => {
            if (exporting) return;
            setExporting(true);
            try {
              await downloadRunExport(runId, "docx");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Export failed");
            } finally {
              setExporting(false);
            }
          }}
          disabled={exporting}
          style={{
            padding: "5px 10px",
            background: ACCENT,
            color: "white",
            border: "none",
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            cursor: exporting ? "wait" : "pointer",
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? "Exporting..." : "Word"}
        </button>
      </div>

      {/* Body: output center + TOC sidebar */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            justifyContent: "center",
            padding: "32px 24px",
            background: c.bg,
          }}
        >
          <div style={{ maxWidth: 720, width: "100%" }}>
            {/* Output header */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 10,
                  color: c.t3,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                {workflow.description || generatedLabel}
              </div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  marginBottom: 6,
                  color: c.t1,
                }}
              >
                {workflow.name}
              </h1>
              <div style={{ fontSize: 12, color: c.t2 }}>
                Generated {formatDate(run.completed_at ?? run.started_at)} · Run #
                {run.run_number} · {run.document_ids.length} document
                {run.document_ids.length === 1 ? "" : "s"} analyzed
              </div>
            </div>

            {stages.map((stage) => (
              <MemoSection
                key={stage.id}
                stage={stage}
                theme={theme}
                activeCitationId={activeCitationId}
                onCitationClick={(cite, id) => {
                  setActiveCitationId(id);
                  setViewerState({
                    dealId,
                    filename: cite.source_file,
                    page: cite.page,
                    snippet: cite.text_snippet || "",
                  });
                }}
              />
            ))}

            <div
              style={{
                fontSize: 12,
                color: c.t3,
                fontStyle: "italic",
                padding: "16px 0",
                borderTop: `1px solid ${c.border}`,
                marginTop: 24,
              }}
            >
              {generatedLabel} generated from {run.document_ids.length} document
              {run.document_ids.length === 1 ? "" : "s"}. All citations link to
              source passages.
            </div>
          </div>
        </div>

        {/* TOC + sources sidebar */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: `1px solid ${c.border}`,
            background: c.surfaceAlt,
            overflowY: "auto",
            padding: 16,
          }}
        >
          <SectionLabel theme={theme}>Contents</SectionLabel>
          {stages.map((s) => (
            <a
              key={s.id}
              href={`#stage-${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(`stage-${s.id}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                display: "block",
                fontSize: 11,
                color: c.t1,
                padding: "5px 8px",
                cursor: "pointer",
                borderRadius: 4,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {s.order_index}. {s.label}
            </a>
          ))}

          <div style={{ marginTop: 20 }}>
            <SectionLabel theme={theme}>Sources</SectionLabel>
            {run.document_ids.map((docId) => {
              const doc = docs.find((d) => d.doc_id === docId);
              const filename = doc?.filename ?? docId;
              const cites = citesByDoc.get(filename) ?? 0;
              return (
                <div
                  key={docId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    fontSize: 11,
                    color: c.t2,
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                    title={filename}
                  >
                    📄 {filename}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: c.t3,
                      fontFamily: "var(--font-mono, monospace)",
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    {cites} cite{cites === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
          </div>
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

function MemoSection({
  stage,
  theme,
  activeCitationId,
  onCitationClick,
}: {
  stage: AssistantStageOutput;
  theme: Theme;
  activeCitationId: string | null;
  onCitationClick: (cite: Citation, id: string) => void;
}) {
  const c = ddTheme(theme);
  const body = stage.edited_md ?? stage.output_md;
  return (
    <div id={`stage-${stage.id}`} style={{ marginBottom: 26, scrollMarginTop: 24 }}>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 8,
          color: c.t1,
        }}
      >
        {stage.order_index}. {stage.label}
      </h3>
      <div
        style={{
          padding: "2px 0",
          fontSize: 13,
          color: c.t2,
        }}
      >
        <AnswerText
          text={body}
          citations={stage.citations}
          activeCitId={activeCitationId}
          onCit={onCitationClick}
        />
      </div>
    </div>
  );
}

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
