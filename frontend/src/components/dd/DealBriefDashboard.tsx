
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Citation } from "@/lib/api";
import { listDocuments, getBriefOverrides, putBriefOverrides } from "@/lib/api";
import {
  listRuns,
  startWorkflowRun,
  subscribeRun,
  type RunStreamEvent,
  type TabularCell,
  type Workflow,
  type WorkflowColumn,
  type WorkflowRun,
} from "@/lib/workflows";
import { getWorkflow } from "@/lib/workflows";
import { extractFindingsFromRun } from "./extractFindingsFromRun";
import type { Finding, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";

// Local shape mirrors the old WorkstreamPanel.QuestionResult — the brief's
// parsing/rendering code below was written against this interface and was
// kept verbatim when the Workstreams tab was retired.
interface QuestionResult {
  answer: string;
  /**
   * The cell's typed `answer_formatted`. KV panels (snapshot/transaction) read
   * `pairs` and the list panel (next actions) reads `items` directly from here;
   * prose panels fall back to `answer`.
   */
  formatted?: TabularCell["answer_formatted"];
  citations: (Citation | null)[];
  status: "pending" | "loading" | "complete" | "error";
  model?: string;
  fallback?: boolean;
  duration_ms?: number;
  completed_at?: number;
}

// Local shape mirrors the old Workstream type. The brief only uses
// `templates` for label/query lookups.
interface BriefTemplate { label: string; query: string }
interface BriefWorkstreamShim { id: "proactive_scan"; templates: BriefTemplate[] }

const PROACTIVE_SCAN_WORKFLOW_ID = "builtin_proactive_scan";

type OverrideStore = Record<string, Record<string, string>>;

const OVERRIDE_KEY_PREFIX = "vyntic_brief_overrides_";
const DIFF_KEY_PREFIX = "vyntic_brief_diff_";

interface FieldDiff {
  panel: "snapshot" | "transaction";
  panelLabel: string;
  label: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
}

interface BriefDiffSnapshot {
  changes: FieldDiff[];
  at: number;
  previousAt?: number;
}

interface Props {
  dealId: string;
  theme: "light" | "dark";
  /** Drives which brief runs and how its panels are labelled. Defaults to the
   * buyout Deal Brief; "fund" workspaces get the LP Fund Brief. */
  entityType?: "deal" | "fund";
  /** Optional — opens a citation in the doc viewer. */
  onCit?: (citation: Citation, id: string) => void;
  /**
   * Called whenever a Proactive Scan run completes and produces structured
   * findings. Parent wires this to `useFindings.syncScanFindings`.
   */
  onFindingsExtracted?: (findings: Finding[]) => void;
}

/**
 * The prose panels (financial highlights, investment thesis) parse the cell's
 * free-form text via extractMetrics / extractFinancialTables /
 * extractThesisSections. Prefer the typed `body`, then `summary`, then the raw
 * streamed answer. KV and list panels don't use this — they read the cell's
 * typed `answer_formatted` directly (see pairsToFields / deriveActions), so the
 * old JSON→fake-markdown→regex round-trip is gone.
 */
function briefProse(cell: TabularCell): string {
  const raw = cell.answer || "";
  const formatted = cell.answer_formatted;
  if (formatted && typeof formatted === "object" && !Array.isArray(formatted)) {
    const prose = formatted as { summary?: string; body?: string };
    if (typeof prose.body === "string" && prose.body.trim()) return prose.body;
    if (typeof prose.summary === "string" && prose.summary.trim()) return prose.summary;
  }
  return raw;
}

function cellToQuestionResult(cell: TabularCell): QuestionResult {
  return {
    answer: briefProse(cell),
    formatted: cell.answer_formatted,
    citations: cell.citations || [],
    status:
      cell.status === "complete"
        ? "complete"
        : cell.status === "error"
          ? "error"
          : cell.status === "running"
            ? "loading"
            : "pending",
    model: cell.model,
    fallback: cell.fallback,
    duration_ms: cell.duration_ms,
    completed_at: cell.completed_at ? new Date(cell.completed_at).getTime() : undefined,
  };
}

function cellsToScanResults(cells: TabularCell[], columns: WorkflowColumn[]): Record<string, QuestionResult> {
  const colById = new Map(columns.map((col) => [col.id, col]));
  const out: Record<string, QuestionResult> = {};
  for (const cell of cells) {
    const col = colById.get(cell.column_id);
    if (!col) continue;
    // Brief lookups key by template.query == column.prompt verbatim.
    out[col.prompt] = cellToQuestionResult(cell);
  }
  return out;
}

function workflowToScanShim(workflow: Workflow | null): BriefWorkstreamShim | null {
  if (!workflow || workflow.type !== "tabular") return null;
  return {
    id: "proactive_scan",
    templates: workflow.columns
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((col) => ({ label: col.label, query: col.prompt })),
  };
}

/**
 * Fetches the latest Proactive Scan workflow run for the deal and exposes it
 * in the legacy QuestionResult shape so the brief's parsing/rendering code
 * (~1.5k lines below) can stay untouched.
 */
function useProactiveScanRun(dealId: string, workflowId: string) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, QuestionResult>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the workflow definition once on mount (or dealId/workflow change) so
  // we know the column layout the brief expects.
  useEffect(() => {
    let active = true;
    setWorkflow(null);
    setRun(null);
    setScanResults({});
    getWorkflow(dealId, workflowId)
      .then((wf) => {
        if (active) setWorkflow(wf);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflowId]);

  // Fetch the latest run on dealId change. We take the most recent non-aborted
  // run — pending/running/complete are all worth surfacing (the SSE
  // subscription below transitions a pending run to populated as cells stream
  // in). Only "cancelled" and "error" are skipped.
  useEffect(() => {
    let active = true;
    listRuns(dealId, workflowId)
      .then((runs) => {
        if (!active) return;
        const sorted = [...runs].sort((a, b) =>
          (b.started_at || "").localeCompare(a.started_at || ""),
        );
        const latest =
          sorted.find((r) => r.status !== "cancelled" && r.status !== "error") ?? null;
        setRun(latest);
        if (latest && workflow) {
          setScanResults(cellsToScanResults(latest.cells, workflow.columns));
        } else {
          setScanResults({});
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [dealId, workflowId, workflow]);

  // SSE subscription keyed by runId (not the full run object). Using the id
  // avoids reconnect churn: each "snapshot" event calls setRun(event.run)
  // which creates a new reference, but the id is stable across status
  // transitions, so the subscription stays open until the run actually
  // changes (e.g. the user kicks off a new one).
  const runId = run?.id ?? null;
  useEffect(() => {
    if (!runId || !workflow) return;
    const unsubscribe = subscribeRun(runId, (event: RunStreamEvent) => {
      if (event.type === "snapshot") {
        setRun(event.run);
        setScanResults(cellsToScanResults(event.run.cells, workflow.columns));
      } else if (event.type === "cell") {
        setScanResults((prev) => {
          const col = workflow.columns.find((c) => c.id === event.cell.column_id);
          if (!col) return prev;
          return {
            ...prev,
            [col.prompt]: cellToQuestionResult(event.cell),
          };
        });
      } else if (event.type === "run") {
        setRun((prev) => (prev ? { ...prev, status: event.status } : prev));
      }
    });
    return unsubscribe;
  }, [runId, workflow]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const docs = await listDocuments(dealId);
      if (docs.length === 0) {
        throw new Error("Upload at least one document before running the brief.");
      }
      const newRun = await startWorkflowRun(
        dealId,
        workflowId,
        docs.map((d) => d.doc_id),
        [],
      );
      setRun(newRun);
      // Seed scanResults with loading state for every column so the UI shows
      // the panels animating while cells stream in.
      if (workflow) {
        const seeded: Record<string, QuestionResult> = {};
        for (const col of workflow.columns) {
          seeded[col.prompt] = { answer: "", citations: [], status: "loading" };
        }
        setScanResults(seeded);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [dealId, workflowId, workflow]);

  // Extract structured findings from the latest run's cells. Pure derived
  // state — recomputes whenever the run changes. The brief's findings panel
  // reads from here; the parent useFindings hook is fed via the
  // onFindingsExtracted callback in the dashboard body.
  const findings: Finding[] = useMemo(() => {
    if (!run || !workflow) return [];
    return extractFindingsFromRun(run.cells, workflow.columns);
  }, [run, workflow]);

  return {
    workflow,
    run,
    scanWorkstream: workflowToScanShim(workflow),
    scanResults,
    findings,
    refresh,
    refreshing,
    error,
  };
}

interface BriefField {
  label: string;
  value: string;
  sourceIdx?: number;
  override?: boolean;
}

interface Metric {
  label: string;
  value: string;
  context: string;
}

interface ThesisBullet {
  text: string;
  sourceIdx?: number;
}

interface ThesisSections {
  thesis: ThesisBullet[];
  levers: ThesisBullet[];
  exit: ThesisBullet[];
  risks: ThesisBullet[];
}

interface FinancialTable {
  title: string;
  headers: string[];
  rows: string[][];
}

type FinancialView = "annual" | "quarterly" | "metrics";

interface ChartPoint {
  period: string;
  value: number;
  display: string;
}

interface ChartSeries {
  label: string;
  values: ChartPoint[];
}

function lineClamp(lineCount: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lineCount,
    overflow: "hidden",
  };
}

const DEAL_SNAPSHOT_LABEL = "Deal snapshot";
const PROPOSED_TRANSACTION_LABEL = "Proposed transaction";
const FINANCIAL_HIGHLIGHTS_LABEL = "Key financial highlights";
const INVESTMENT_THESIS_LABEL = "Investment thesis";
const NEXT_ACTIONS_LABEL = "Analyst next actions";

const SNAPSHOT_FIELDS = [
  "Target",
  "Company",
  "Sector",
  "Business model",
  "Geography",
  "Seller",
  "Stage",
];

const TRANSACTION_FIELDS = [
  "Transaction type",
  "Purchase price",
  "Enterprise value",
  "Ownership",
  "Valuation",
  "Financing",
  "Timing",
];

const FUND_SNAPSHOT_FIELDS = [
  "Manager",
  "Fund",
  "Vintage",
  "Strategy",
  "Target size",
  "Hard cap",
  "Geography",
  "Raise stage",
];

const FUND_TERMS_FIELDS = [
  "Management fee",
  "Carried interest",
  "Preferred return",
  "Waterfall",
  "GP commitment",
  "Fee offset",
  "Key person",
  "Term",
];

// Entity-aware brief configuration. The buyout Deal Brief and the LP Fund Brief
// share the same dashboard machinery; only the workflow id, the two kv panels'
// column-labels / field-lists / titles, the financial-highlights column label,
// and the copy differ. `snapshotLabel`/`transactionLabel`/`financialLabel` must
// equal the seed column labels exactly (resultByLabel matches on label).
interface BriefEntityConfig {
  workflowId: string;
  runLabel: string;
  snapshotLabel: string;
  snapshotTitle: string;
  snapshotFields: string[];
  transactionLabel: string;
  transactionTitle: string;
  transactionDiffLabel: string;
  transactionFields: string[];
  financialLabel: string;
  financialTabLabel: string;
}

const BRIEF_CONFIG: Record<"deal" | "fund", BriefEntityConfig> = {
  deal: {
    workflowId: PROACTIVE_SCAN_WORKFLOW_ID,
    runLabel: "Deal Brief",
    snapshotLabel: DEAL_SNAPSHOT_LABEL,
    snapshotTitle: "What is the deal?",
    snapshotFields: SNAPSHOT_FIELDS,
    transactionLabel: PROPOSED_TRANSACTION_LABEL,
    transactionTitle: "What is being proposed?",
    transactionDiffLabel: "Proposed Transaction",
    transactionFields: TRANSACTION_FIELDS,
    financialLabel: FINANCIAL_HIGHLIGHTS_LABEL,
    financialTabLabel: "Annual",
  },
  fund: {
    workflowId: "builtin_lp_fund_brief",
    runLabel: "Fund Brief",
    snapshotLabel: "Fund snapshot",
    snapshotTitle: "About the fund",
    snapshotFields: FUND_SNAPSHOT_FIELDS,
    transactionLabel: "Terms at a glance",
    transactionTitle: "Terms at a glance",
    transactionDiffLabel: "Terms",
    transactionFields: FUND_TERMS_FIELDS,
    financialLabel: "Key performance data",
    financialTabLabel: "Track record",
  },
};

const METRIC_KEYWORDS = [
  "Revenue",
  "ARR",
  "MRR",
  "Gross margin",
  "EBITDA",
  "Adjusted EBITDA",
  "EBITDA margin",
  "Growth",
  "Net revenue retention",
  "NRR",
  "Churn",
  "Capex",
  "Free cash flow",
  "FCF",
  "Net debt",
  "Working capital",
  "Customer concentration",
];

const VALUE_PATTERN = /(?:[$€£]\s?\d[\d,.]*(?:\s?(?:m|mm|bn|k))?|\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?x)/gi;

export default function DealBriefDashboard({
  dealId,
  theme,
  entityType = "deal",
  onCit,
  onFindingsExtracted,
}: Props) {
  const c = ddTheme(theme);
  const brief = BRIEF_CONFIG[entityType];
  // Findings are auto-extracted from the latest completed Proactive Scan run.
  // useProactiveScanRun returns them; we expose them locally for the brief's
  // own findings panel and re-emit via onFindingsExtracted so the parent's
  // useFindings hook can persist them.
  const onSelectFinding = useCallback((_finding: Finding) => {
    // Brief's finding rows aren't routable to a per-workstream view since the
    // workstreams tab is gone. Future: open the doc viewer at the citation.
  }, []);

  const {
    run,
    scanWorkstream,
    scanResults,
    findings,
    refresh: kickOffRun,
    refreshing,
    error: runError,
  } = useProactiveScanRun(dealId, brief.workflowId);

  // Push extracted findings up to the parent (which owns useFindings) so the
  // deal-breaker pill in TopBar reflects current data. Only fires once per
  // distinct findings list — onFindingsExtracted is responsible for de-duping.
  useEffect(() => {
    if (!onFindingsExtracted) return;
    if (!run || run.status !== "complete") return;
    onFindingsExtracted(findings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.status, findings.length]);

  const scanTemplates = scanWorkstream?.templates || [];
  const completed = scanTemplates.filter((template) => scanResults[template.query]?.status === "complete").length;
  const total = scanTemplates.length;
  const scanStarted = Object.values(scanResults).some((result) => result.status !== "pending");
  const isLoading = Object.values(scanResults).some((result) => result.status === "loading");
  // "Run Deal Brief" CTA shows when no completed cells exist yet.
  const hasAnyCompleted = Object.values(scanResults).some((r) => r.status === "complete");
  const onOpenProactiveScan = kickOffRun;

  const [overrides, setOverrides] = useState<OverrideStore>({});

  // Load overrides from the server; migrate localStorage up once if empty.
  useEffect(() => {
    let active = true;
    const readLocal = (): OverrideStore => {
      try {
        const raw = localStorage.getItem(OVERRIDE_KEY_PREFIX + dealId);
        return raw ? (JSON.parse(raw) as OverrideStore) : {};
      } catch {
        return {};
      }
    };
    (async () => {
      try {
        const server = await getBriefOverrides(dealId);
        if (!active) return;
        if (Object.keys(server).length > 0) {
          setOverrides(server);
          return;
        }
        const local = readLocal();
        if (Object.keys(local).length > 0) {
          setOverrides(local);
          try {
            await putBriefOverrides(dealId, local);
            if (active) localStorage.removeItem(OVERRIDE_KEY_PREFIX + dealId);
          } catch {}
        } else {
          setOverrides({});
        }
      } catch {
        if (active) setOverrides(readLocal());
      }
    })();
    return () => {
      active = false;
    };
  }, [dealId]);

  const setOverride = useCallback(
    (panelKey: string, label: string, value: string | null) => {
      setOverrides((prev) => {
        const panel = { ...(prev[panelKey] || {}) };
        const trimmed = value?.trim() ?? "";
        if (!trimmed) {
          delete panel[label];
        } else {
          panel[label] = trimmed;
        }
        const next: OverrideStore = { ...prev };
        if (Object.keys(panel).length > 0) next[panelKey] = panel;
        else delete next[panelKey];
        // Best-effort server persistence (last-write-wins).
        void putBriefOverrides(dealId, next).catch(() => {});
        return next;
      });
    },
    [dealId]
  );

  const snapshotResult = resultByLabel(scanWorkstream, scanResults, brief.snapshotLabel);
  const transactionResult = resultByLabel(scanWorkstream, scanResults, brief.transactionLabel);
  const financialResult = resultByLabel(scanWorkstream, scanResults, brief.financialLabel);
  const thesisResult = resultByLabel(scanWorkstream, scanResults, INVESTMENT_THESIS_LABEL);
  const nextActionsResult = resultByLabel(scanWorkstream, scanResults, NEXT_ACTIONS_LABEL);

  const snapshotFields = mergeOverrides(
    pairsToFields(snapshotResult?.formatted, brief.snapshotFields),
    overrides.snapshot,
    brief.snapshotFields
  );
  const transactionFields = mergeOverrides(
    pairsToFields(transactionResult?.formatted, brief.transactionFields),
    overrides.transaction,
    brief.transactionFields
  );

  const lastScanAt = useMemo(() => {
    let max = 0;
    for (const result of Object.values(scanResults)) {
      if (result.status === "complete" && result.completed_at && result.completed_at > max) {
        max = result.completed_at;
      }
    }
    return max || null;
  }, [scanResults]);

  const [rerunning, setRerunning] = useState(false);
  const [diff, setDiff] = useState<BriefDiffSnapshot | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const beforeSnapshotRef = useRef<{
    snapshot: BriefField[];
    transaction: BriefField[];
    previousAt?: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(DIFF_KEY_PREFIX + dealId);
      setDiff(raw ? (JSON.parse(raw) as BriefDiffSnapshot) : null);
    } catch {
      setDiff(null);
    }
    setDiffOpen(false);
  }, [dealId]);

  const persistDiff = useCallback(
    (next: BriefDiffSnapshot | null) => {
      setDiff(next);
      if (typeof window === "undefined") return;
      try {
        if (next) localStorage.setItem(DIFF_KEY_PREFIX + dealId, JSON.stringify(next));
        else localStorage.removeItem(DIFF_KEY_PREFIX + dealId);
      } catch {}
    },
    [dealId]
  );

  const handleRerun = useCallback(() => {
    if (refreshing || !scanWorkstream) return;
    beforeSnapshotRef.current = {
      snapshot: snapshotFields.map((f) => ({ ...f })),
      transaction: transactionFields.map((f) => ({ ...f })),
      previousAt: lastScanAt ?? undefined,
    };
    setRerunning(true);
    void kickOffRun().finally(() => setRerunning(false));
    // Diff snapshot logic stays — once the new run completes the hook updates
    // scanResults via SSE and the field-extraction below re-derives fields.
    // We compute the diff in a separate effect (see below).
  }, [kickOffRun, lastScanAt, refreshing, scanWorkstream, snapshotFields, transactionFields]);

  // After a rerun completes, compute the diff against the snapshot we took
  // at kickoff time. `rerunning` flips to false once the new run is queued,
  // but we want to wait until ALL cells are complete to compare.
  useEffect(() => {
    if (rerunning) return;
    const before = beforeSnapshotRef.current;
    if (!before) return;
    if (!hasAnyCompleted || isLoading) return;
    if (!scanWorkstream) return;
    const newSnapshotFields = mergeOverrides(
      pairsToFields(
        scanResults[scanWorkstream.templates.find((t) => t.label === brief.snapshotLabel)?.query || ""]?.formatted,
        brief.snapshotFields,
      ),
      overrides.snapshot,
      brief.snapshotFields,
    );
    const newTransactionFields = mergeOverrides(
      pairsToFields(
        scanResults[scanWorkstream.templates.find((t) => t.label === brief.transactionLabel)?.query || ""]?.formatted,
        brief.transactionFields,
      ),
      overrides.transaction,
      brief.transactionFields,
    );
    const changes = [
      ...diffPanel("snapshot", brief.snapshotLabel, before.snapshot, newSnapshotFields),
      ...diffPanel("transaction", brief.transactionDiffLabel, before.transaction, newTransactionFields),
    ];
    const next: BriefDiffSnapshot = { changes, at: Date.now(), previousAt: before.previousAt };
    persistDiff(next);
    if (changes.length > 0) setDiffOpen(true);
    beforeSnapshotRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnyCompleted, isLoading, rerunning]);

  const dismissDiff = useCallback(() => {
    persistDiff(null);
    setDiffOpen(false);
  }, [persistDiff]);
  const metrics = extractMetrics(financialResult?.answer);
  const financialTables = extractFinancialTables(financialResult?.answer);
  const thesisSections = extractThesisSections(thesisResult?.answer);
  const nextActions = deriveActions(nextActionsResult?.formatted, nextActionsResult?.answer, findings);
  const topFindings = findings.slice().sort(compareFindingSeverity).slice(0, 4);
  const gapCount = findings.filter(isGapFinding).length;
  const inconsistencyCount = findings.filter(isInconsistencyFinding).length;
  const sourceCount = countSources([snapshotResult, transactionResult, financialResult, thesisResult, nextActionsResult]);
  const dealBreakerCount = findings.filter((finding) => finding.sev === "deal-breaker").length;
  const materialCount = findings.filter((finding) => finding.sev === "material").length;

  const handleCit = (sourceIdx: number | undefined, citations: (Citation | null)[], idPrefix: string) => {
    if (!onCit || !sourceIdx) return;
    const citation = citations[sourceIdx - 1];
    if (citation) onCit(citation, `${idPrefix}-src-${sourceIdx}`);
  };

  const handleFindingSource = useCallback(
    (finding: Finding) => {
      if (!onCit || !finding.sourceCitation) return;
      onCit(finding.sourceCitation, `${finding.id}-src`);
    },
    [onCit],
  );

  return (
    <div style={{ padding: "20px 16px 28px" }}>
      <section style={{ maxWidth: 1320, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 28,
            padding: "20px",
            boxShadow: theme === "dark"
              ? "0 16px 34px rgba(0,0,0,0.44)"
              : "0 12px 30px rgba(17,17,17,0.11), 0 1px 2px rgba(17,17,17,0.05)",
          }}
        >
          <div
            className="font-mono-plex"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: c.t3,
            }}
          >
            Automated brief
          </div>

          <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div style={{ maxWidth: 760 }}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 600, color: c.t1 }}>
                  {brief.runLabel}
                </h2>
                <StatusPill completed={completed} total={total} loading={isLoading || rerunning} theme={theme} />
                {lastScanAt && <FreshnessPill at={lastScanAt} theme={theme} />}
                {diff && diff.changes.length > 0 && (
                  <DiffPill
                    count={diff.changes.length}
                    theme={theme}
                    onClick={() => setDiffOpen((value) => !value)}
                    active={diffOpen}
                  />
                )}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7, color: c.t2 }}>
                Snapshot the target, proposed transaction, financial context, key risks, and analyst follow-ups in one review surface.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {sourceCount > 0 && <SourcePill count={sourceCount} theme={theme} />}
              {scanStarted && (
                <button
                  onClick={handleRerun}
                  disabled={rerunning || refreshing}
                  title="Re-run the deal brief"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: rerunning ? c.t3 : c.t1,
                    background: c.surfaceAlt,
                    border: `1px solid ${c.border}`,
                    borderRadius: 999,
                    padding: "10px 14px",
                    cursor: rerunning ? "default" : "pointer",
                  }}
                >
                  {rerunning ? "Re-running…" : "Refresh scan"}
                </button>
              )}
              <button
                onClick={onOpenProactiveScan}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--on-accent)",
                  background: ACCENT,
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 16px",
                  cursor: "pointer",
                }}
              >
                {scanStarted ? "Run again" : `Run ${brief.runLabel.toLowerCase()}`}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginTop: 18,
            }}
          >
            <BriefStatCard
              label="Coverage"
              value={total > 0 ? `${completed}/${total}` : "0/0"}
              detail={total > 0 ? "Brief sections populated" : "No scan schema detected"}
              theme={theme}
            />
            <BriefStatCard
              label="Sources"
              value={sourceCount}
              detail="Cited inputs referenced"
              theme={theme}
            />
            <BriefStatCard
              label="Deal-breakers"
              value={dealBreakerCount}
              detail="Highest-severity findings"
              theme={theme}
              tone="alert"
            />
            <BriefStatCard
              label="Material"
              value={materialCount}
              detail="Items needing diligence"
              theme={theme}
            />
            <BriefStatCard
              label="Mismatches"
              value={inconsistencyCount}
              detail="Cross-document inconsistencies"
              theme={theme}
            />
          </div>
        </div>

        {runError && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 18,
              border: "1px solid #f0c2bd",
              background: theme === "dark" ? "#2a1212" : "#fff4f3",
              color: theme === "dark" ? "#f0b3ad" : "#9a2e23",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {runError}
          </div>
        )}

        {diff && diffOpen && diff.changes.length > 0 && (
          <DiffPanel diff={diff} theme={theme} onDismiss={dismissDiff} onClose={() => setDiffOpen(false)} />
        )}

        {!scanStarted ? (
          <EmptyBrief theme={theme} onOpenProactiveScan={onOpenProactiveScan} config={brief} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
              <BriefPanel
                title={brief.snapshotTitle}
                panelKey="snapshot"
                fields={snapshotFields}
                citations={snapshotResult?.citations || []}
                fallback={snapshotResult?.answer}
                theme={theme}
                onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, snapshotResult?.citations || [], "snapshot") : undefined}
                onOverride={setOverride}
              />
              <BriefPanel
                title={brief.transactionTitle}
                panelKey="transaction"
                fields={transactionFields}
                citations={transactionResult?.citations || []}
                fallback={transactionResult?.answer}
                theme={theme}
                onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, transactionResult?.citations || [], "transaction") : undefined}
                onOverride={setOverride}
              />
            </div>

            <FinancialPanel
              metrics={metrics}
              tables={financialTables}
              fallback={financialResult?.answer}
              theme={theme}
              primaryTabLabel={brief.financialTabLabel}
              panelTitle={entityType === "fund" ? "Key performance data" : undefined}
            />

            <ThesisPanel
              sections={thesisSections}
              citations={thesisResult?.citations || []}
              fallback={thesisResult?.answer}
              theme={theme}
              onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, thesisResult?.citations || [], "thesis") : undefined}
              loading={thesisResult?.status === "loading"}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
              <FindingsPanel
                findings={topFindings}
                gapCount={gapCount}
                inconsistencyCount={inconsistencyCount}
                theme={theme}
                onSelectFinding={onSelectFinding}
                onOpenSource={handleFindingSource}
              />
              <ActionsPanel
                actions={nextActions}
                citations={nextActionsResult?.citations || []}
                theme={theme}
                onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, nextActionsResult?.citations || [], "actions") : undefined}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function BriefStatCard({
  label,
  value,
  detail,
  theme,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  theme: "light" | "dark";
  tone?: "default" | "alert";
}) {
  const c = ddTheme(theme);
  const isAlert = tone === "alert";

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 20,
        border: `1px solid ${isAlert ? (theme === "dark" ? "#4b1919" : "#f0c2bd") : c.border}`,
        background: isAlert ? (theme === "dark" ? "#2a1212" : "#fff4f3") : c.surfaceAlt,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isAlert ? (theme === "dark" ? "#f0b3ad" : "#9a2e23") : c.t3,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 24, lineHeight: 1, fontWeight: 600, color: c.t1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: c.t2 }}>{detail}</div>
    </div>
  );
}

function EmptyBrief({ theme, onOpenProactiveScan, config }: { theme: "light" | "dark"; onOpenProactiveScan: () => void; config: BriefEntityConfig }) {
  const c = ddTheme(theme);
  const isFund = config.workflowId === "builtin_lp_fund_brief";
  const blurb = isFund
    ? "Run the fund brief to extract the fund snapshot, terms vs. market, track record, key risks, and analyst next steps from the manager's documents."
    : "Run the proactive scan to extract target profile, transaction terms, financial highlights, key risks, and analyst next steps from the current VDR.";
  return (
    <div
      style={{
        padding: "24px",
        border: `1px dashed ${c.border}`,
        borderRadius: 28,
        background: c.surface,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: c.t3,
        }}
      >
        Ready to scan
      </div>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div style={{ maxWidth: 700 }}>
          <div style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 600, color: c.t1 }}>No {config.runLabel.toLowerCase()} yet</div>
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7, color: c.t2 }}>
            {blurb}
          </div>
        </div>

        <button
          onClick={onOpenProactiveScan}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--on-accent)",
            background: ACCENT,
            border: "none",
            borderRadius: 999,
            padding: "11px 16px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Run {config.runLabel.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function BriefPanel({
  title,
  panelKey,
  fields,
  citations,
  fallback,
  theme,
  onCit,
  onOverride,
}: {
  title: string;
  panelKey: string;
  fields: BriefField[];
  citations: (Citation | null)[];
  fallback?: string;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  onOverride?: (panelKey: string, label: string, value: string | null) => void;
}) {
  const c = ddTheme(theme);
  const fallbackItems = fields.length === 0 ? extractBullets(fallback).slice(0, 4) : [];

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
        minHeight: 220,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: c.t3,
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {title}
      </div>
      {fields.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fields.slice(0, 7).map((field) => (
            <EditableField
              key={`${panelKey}-${field.label}`}
              field={field}
              citation={field.sourceIdx ? citations[field.sourceIdx - 1] : undefined}
              theme={theme}
              onCit={onCit}
              onSave={onOverride ? (value) => onOverride(panelKey, field.label, value) : undefined}
            />
          ))}
        </div>
      ) : fallbackItems.length > 0 ? (
        <BulletList items={fallbackItems} theme={theme} />
      ) : (
        <Placeholder text="Awaiting scan output" theme={theme} />
      )}
    </div>
  );
}

function EditableField({
  field,
  citation,
  theme,
  onCit,
  onSave,
}: {
  field: BriefField;
  citation?: Citation | null;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  onSave?: (value: string | null) => void;
}) {
  const c = ddTheme(theme);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(field.value);
  }, [field.value, editing]);

  const editable = Boolean(onSave);

  const commit = () => {
    if (!onSave) return;
    setEditing(false);
    const next = draft.trim();
    if (next === field.value) return;
    onSave(next || null);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(field.value);
  };

  return (
    <div
      style={{
        minWidth: 0,
        padding: "10px 12px",
        borderRadius: 16,
        border: `1px solid ${c.border}`,
        background: c.surfaceAlt,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center" style={{ gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase" }}>{field.label}</span>
        {field.override && <OverrideBadge theme={theme} />}
        <span style={{ flex: 1 }} />
        {editable && !editing && (hover || field.override) && (
          <button
            onClick={() => setEditing(true)}
            title="Edit value"
            style={{ background: "transparent", border: "none", color: c.t3, cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
          >
            ✎
          </button>
        )}
        {editable && !editing && hover && field.override && (
          <button
            onClick={() => onSave?.(null)}
            title="Reset to scan output"
            style={{ background: "transparent", border: "none", color: c.t3, cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
          >
            ↺
          </button>
        )}
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          style={{
            width: "100%",
            marginTop: 4,
            padding: "8px 10px",
            fontSize: 12,
            color: c.t1,
            background: c.surface,
            border: `1px solid ${ACCENT}`,
            borderRadius: 12,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <div
          onClick={editable ? () => setEditing(true) : undefined}
          style={{
            marginTop: 4,
            fontSize: 12,
            color: c.t1,
            lineHeight: 1.5,
            overflowWrap: "anywhere",
            cursor: editable ? "text" : "default",
          }}
        >
          {field.value}
          {field.sourceIdx !== undefined && (
            <SourceChip citation={citation} index={field.sourceIdx} onClick={onCit ? () => onCit(field.sourceIdx!) : undefined} />
          )}
        </div>
      )}
    </div>
  );
}

function OverrideBadge({ theme }: { theme: "light" | "dark" }) {
  return (
    <span
      title="Analyst override"
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: theme === "dark" ? "#fcd34d" : "#b45309",
        background: theme === "dark" ? "#78350f55" : "#fef3c7",
        border: `1px solid ${theme === "dark" ? "#92400e" : "#fde68a"}`,
        borderRadius: 999,
        padding: "2px 6px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      ✎ override
    </span>
  );
}

function FinancialPanel({
  metrics,
  tables,
  fallback,
  theme,
  primaryTabLabel = "Annual",
  panelTitle,
}: {
  metrics: Metric[];
  tables: FinancialTable[];
  fallback?: string;
  theme: "light" | "dark";
  primaryTabLabel?: string;
  panelTitle?: string;
}) {
  const c = ddTheme(theme);
  const fallbackItems = metrics.length === 0 ? extractBullets(fallback).slice(0, 4) : [];
  const annualTable = tables.find((table) => /annual|year|income statement/i.test(table.title)) || tables[0];
  const quarterlyTable = tables.find((table) => /quarter|q[1-4]/i.test(table.title));
  // Auto-pick the best view from whatever data is available right now; if the user
  // clicks a tab we honor their choice via `userView`.
  const autoView: FinancialView = annualTable
    ? "annual"
    : quarterlyTable
    ? "quarterly"
    : "metrics";
  const [userView, setUserView] = useState<FinancialView | null>(null);
  const view: FinancialView = userView ?? autoView;
  const activeTable = view === "quarterly" ? quarterlyTable : view === "annual" ? annualTable : null;
  const chartSeries = useMemo(() => (activeTable ? buildChartSeries(activeTable) : []), [activeTable]);
  const hasStructuredData = Boolean(activeTable) || metrics.length > 0 || fallbackItems.length > 0;

  // If a user-selected tab loses its underlying data (e.g. table disappears after re-run),
  // fall back to auto-pick.
  useEffect(() => {
    if (userView === "annual" && !annualTable) setUserView(null);
    if (userView === "quarterly" && !quarterlyTable) setUserView(null);
    if (userView === "metrics" && metrics.length === 0 && fallbackItems.length === 0) setUserView(null);
  }, [annualTable, fallbackItems.length, metrics.length, quarterlyTable, userView]);

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div
          className="font-mono-plex"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: c.t3,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          {panelTitle ?? "Key financial data"}
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedTabs
          options={[
            { id: "annual", label: primaryTabLabel, disabled: !annualTable },
            { id: "quarterly", label: "Quarterly", disabled: !quarterlyTable },
            { id: "metrics", label: "Metrics", disabled: metrics.length === 0 && fallbackItems.length === 0 },
          ]}
          value={view}
          onChange={setUserView}
          theme={theme}
        />
      </div>

      {activeTable ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chartSeries.length > 0 && <FinancialChart series={chartSeries} theme={theme} />}
          <FinancialTableView table={activeTable} theme={theme} />
        </div>
      ) : metrics.length > 0 ? (
        <MetricsTable metrics={metrics} theme={theme} />
      ) : fallbackItems.length > 0 ? (
        <SimpleFinancialTable items={fallbackItems} theme={theme} />
      ) : !hasStructuredData ? (
        <Placeholder text="No financial metrics extracted yet" theme={theme} />
      ) : null}
    </div>
  );
}

function SegmentedTabs({
  options,
  value,
  onChange,
  theme,
}: {
  options: Array<{ id: FinancialView; label: string; disabled: boolean }>;
  value: FinancialView;
  onChange: (view: FinancialView) => void;
  theme: "light" | "dark";
}) {
  const c = ddTheme(theme);
  return (
    <div className="flex items-center" style={{ gap: 2, padding: 3, borderRadius: 999, background: c.surfaceAlt, border: `1px solid ${c.border}` }}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            disabled={option.disabled}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "6px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: option.disabled ? c.t4 : active ? "var(--on-accent)" : c.t2,
              background: active ? ACCENT : "transparent",
              cursor: option.disabled ? "default" : "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FinancialChart({ series, theme }: { series: ChartSeries[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  const max = Math.max(...series.flatMap((item) => item.values.map((point) => Math.abs(point.value))), 1);
  return (
    <div style={{ padding: 12, borderRadius: 18, background: c.surfaceAlt, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trend chart</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {series.slice(0, 3).map((item) => (
          <div key={item.label} style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${item.values.length}, minmax(22px, 1fr))`, gap: 4, alignItems: "end", height: 44 }}>
              {item.values.map((point) => (
                <div key={`${item.label}-${point.period}`} title={`${item.label} ${point.period}: ${point.display}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, minWidth: 0 }}>
                  <div style={{ width: "100%", minHeight: 3, height: `${Math.max(4, (Math.abs(point.value) / max) * 38)}px`, borderRadius: "3px 3px 0 0", background: point.value < 0 ? "#ef4444" : ACCENT }} />
                  <div style={{ fontSize: 8, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{point.period}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinancialTableView({ table, theme }: { table: FinancialTable; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div style={{ borderRadius: 18, border: `1px solid ${c.border}`, background: c.surface, overflow: "hidden" }}>
      <div style={{ padding: "9px 12px", borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.t1, background: c.gridHeader }}>
        {table.title}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="dd-zebra" style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
          <thead>
            <tr>
              {table.headers.map((header, idx) => (
                <th
                  key={`${table.title}-h-${idx}`}
                  style={{
                    padding: "7px 8px",
                    textAlign: idx === 0 ? "left" : "right",
                    fontSize: 10,
                    fontWeight: 700,
                    color: c.t3,
                    background: c.gridHeader,
                    borderBottom: `1px solid ${c.border}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 10).map((row, rIdx) => (
              <tr key={`${table.title}-r-${rIdx}`}>
                {table.headers.map((_, cIdx) => (
                  <td
                    key={`${table.title}-r-${rIdx}-${cIdx}`}
                    className={cIdx > 0 ? "font-mono-dm" : undefined}
                    style={{
                      padding: "7px 8px",
                      textAlign: cIdx === 0 ? "left" : "right",
                      fontSize: 11,
                      color: cIdx === 0 ? c.t1 : c.t2,
                      borderBottom: rIdx === table.rows.length - 1 ? "none" : `1px solid ${c.border}`,
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {row[cIdx] || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricsTable({ metrics, theme }: { metrics: Metric[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div style={{ borderRadius: 18, border: `1px solid ${c.border}`, background: c.surface, overflow: "hidden" }}>
      <table className="dd-zebra" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Metric", "Value", "Context"].map((header, idx) => (
              <th key={header} style={{ padding: "9px 10px", textAlign: idx === 1 ? "right" : "left", fontSize: 10, fontWeight: 700, color: c.t3, background: c.gridHeader, borderBottom: `1px solid ${c.border}` }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.slice(0, 8).map((metric, idx) => (
            <tr key={`${metric.label}-${idx}`}>
              <td style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: c.t1, borderBottom: `1px solid ${c.border}` }}>{metric.label}</td>
              <td className="font-mono-dm" style={{ padding: "9px 10px", fontSize: 11, color: c.t1, textAlign: "right", borderBottom: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>{metric.value}</td>
              <td style={{ padding: "9px 10px", fontSize: 10, color: c.t2, borderBottom: `1px solid ${c.border}` }}>{metric.context}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleFinancialTable({ items, theme }: { items: string[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div style={{ borderRadius: 18, border: `1px solid ${c.border}`, background: c.surface, overflow: "hidden" }}>
      <table className="dd-zebra" style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {items.map((item, idx) => {
            const [label, ...rest] = item.split(":");
            return (
              <tr key={`${item}-${idx}`}>
                <td style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: c.t1, width: "34%", borderBottom: `1px solid ${c.border}` }}>{rest.length ? label : `Item ${idx + 1}`}</td>
                <td style={{ padding: "9px 10px", fontSize: 11, color: c.t2, borderBottom: `1px solid ${c.border}` }}>{rest.length ? rest.join(":").trim() : item}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindingsPanel({
  findings,
  gapCount,
  inconsistencyCount,
  theme,
  onSelectFinding,
  onOpenSource,
}: {
  findings: Finding[];
  gapCount: number;
  inconsistencyCount: number;
  theme: "light" | "dark";
  onSelectFinding: (finding: Finding) => void;
  onOpenSource?: (finding: Finding) => void;
}) {
  const c = ddTheme(theme);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleFinding = useCallback(
    (finding: Finding) => {
      setExpandedIds((prev) => ({ ...prev, [finding.id]: !prev[finding.id] }));
      onSelectFinding(finding);
    },
    [onSelectFinding],
  );

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div
          className="font-mono-plex"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: c.t3,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          What matters most
        </div>
        <div style={{ flex: 1 }} />
        <CountBadge label="Gaps" count={gapCount} theme={theme} />
        <CountBadge label="Mismatches" count={inconsistencyCount} theme={theme} />
      </div>
      {findings.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {findings.map((finding) => {
            const expanded = Boolean(expandedIds[finding.id]);
            const hasSeparateDetail = finding.detail.trim() !== finding.title.trim();
            const canExpand = hasSeparateDetail || finding.title.length > 110;

            return (
              <div
                key={finding.id}
                style={{
                  padding: 12,
                  borderRadius: 18,
                  background: c.surfaceAlt,
                  border: `1px solid ${c.border}`,
                  minWidth: 0,
                }}
              >
                <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <SeverityDot severity={finding.sev} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[finding.sev].color }}>{SEV_COLOR[finding.sev].label}</span>
                  <span style={{ fontSize: 10, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {finding.src}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 650,
                    color: c.t1,
                    lineHeight: 1.45,
                    ...(expanded ? {} : lineClamp(4)),
                  }}
                >
                  {finding.title}
                </div>
                {expanded && hasSeparateDetail && (
                  <div style={{ marginTop: 8, fontSize: 11, color: c.t2, lineHeight: 1.55 }}>
                    {finding.detail}
                  </div>
                )}
                {(canExpand || finding.sourceCitation) && (
                  <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 10 }}>
                    {canExpand && (
                      <button
                        type="button"
                        onClick={() => toggleFinding(finding)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          fontSize: 10,
                          fontWeight: 700,
                          color: c.t2,
                          cursor: "pointer",
                        }}
                      >
                        {expanded ? "Show less" : "Show more"}
                      </button>
                    )}
                    {finding.sourceCitation && (
                      <button
                        type="button"
                        onClick={() => onOpenSource?.(finding)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          fontSize: 10,
                          fontWeight: 700,
                          color: c.t2,
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        Open source
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Placeholder text="Scan findings will appear here" theme={theme} />
      )}
    </div>
  );
}

function ThesisPanel({
  sections,
  citations,
  fallback,
  theme,
  onCit,
  loading,
}: {
  sections: ThesisSections;
  citations: (Citation | null)[];
  fallback?: string;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  loading: boolean;
}) {
  const c = ddTheme(theme);
  const blocks: Array<{ id: keyof ThesisSections; label: string; accent: string; bullets: ThesisBullet[] }> = [
    { id: "thesis", label: "Thesis", accent: ACCENT, bullets: sections.thesis },
    { id: "levers", label: "Value Creation Levers", accent: "#16a34a", bullets: sections.levers },
    { id: "exit", label: "Exit Considerations", accent: "#a855f7", bullets: sections.exit },
    { id: "risks", label: "Risks To Thesis", accent: "#f97316", bullets: sections.risks },
  ];
  const hasAny = blocks.some((b) => b.bullets.length > 0);
  const fallbackBullets: ThesisBullet[] = hasAny ? [] : extractBulletsWithSources(fallback).slice(0, 6);

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div
          className="font-mono-plex"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: c.t3,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Investment thesis
        </div>
        {loading && (
          <span style={{ fontSize: 10, fontWeight: 700, color: c.t2 }}>Synthesizing…</span>
        )}
      </div>
      {hasAny ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {blocks.map((block) => (
            <ThesisColumn key={block.id} label={block.label} accent={block.accent} bullets={block.bullets} citations={citations} theme={theme} onCit={onCit} />
          ))}
        </div>
      ) : fallbackBullets.length > 0 ? (
        <ThesisColumn label="Synthesis" accent={ACCENT} bullets={fallbackBullets} citations={citations} theme={theme} onCit={onCit} />
      ) : (
        <Placeholder text="Thesis synthesis will appear here once the scan completes" theme={theme} />
      )}
    </div>
  );
}

function ThesisColumn({
  label,
  accent,
  bullets,
  citations,
  theme,
  onCit,
}: {
  label: string;
  accent: string;
  bullets: ThesisBullet[];
  citations: (Citation | null)[];
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
}) {
  const c = ddTheme(theme);
  if (bullets.length === 0) {
    return (
      <div style={{ padding: 12, borderRadius: 18, border: `1px solid ${c.border}`, background: c.surfaceAlt, minHeight: 110 }}>
        <ThesisColumnHeader label={label} accent={accent} theme={theme} />
        <div style={{ fontSize: 11, color: c.t3, fontStyle: "italic" }}>Not synthesized</div>
      </div>
    );
  }
  return (
    <div style={{ padding: 12, borderRadius: 18, border: `1px solid ${c.border}`, background: c.surfaceAlt }}>
      <ThesisColumnHeader label={label} accent={accent} theme={theme} />
      <ul style={{ display: "flex", flexDirection: "column", gap: 7, margin: 0, padding: 0, listStyle: "none" }}>
        {bullets.slice(0, 5).map((bullet, idx) => (
          <li key={`${label}-${idx}`} className="flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12, color: c.t1, lineHeight: 1.4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, marginTop: 6, flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              {bullet.text}
              {bullet.sourceIdx !== undefined && (
                <SourceChip citation={citations[bullet.sourceIdx - 1]} index={bullet.sourceIdx} onClick={onCit ? () => onCit(bullet.sourceIdx!) : undefined} />
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThesisColumnHeader({ label, accent, theme }: { label: string; accent: string; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div className="flex items-center" style={{ gap: 6, marginBottom: 7 }}>
      <span style={{ width: 4, height: 12, borderRadius: 2, background: accent }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: c.t2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
    </div>
  );
}

function SourceChip({ citation, index, onClick }: { citation?: Citation | null; index: number; onClick?: () => void }) {
  const interactive = Boolean(onClick);
  const label = citation ? `p.${citation.page}` : `[${index}]`;
  return (
    <button
      type="button"
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      disabled={!interactive}
      title={citation ? `${citation.source_file} — Page ${citation.page}` : `Source ${index}`}
      style={{
        marginLeft: 4,
        padding: "2px 6px",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--on-accent)",
        background: ACCENT,
        border: "none",
        borderRadius: 999,
        cursor: interactive ? "pointer" : "default",
        verticalAlign: "baseline",
        lineHeight: 1.25,
      }}
    >
      {label}
    </button>
  );
}

function ActionsPanel({ actions, citations, theme, onCit }: { actions: ThesisBullet[]; citations: (Citation | null)[]; theme: "light" | "dark"; onCit?: (sourceIdx: number) => void }) {
  const c = ddTheme(theme);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: c.t3,
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        Analyst next actions
      </div>
      {actions.length > 0 ? (
        <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
          {actions.slice(0, 5).map((action, idx) => {
            const actionId = `${idx}-${action.sourceIdx ?? "na"}-${action.text.slice(0, 32)}`;
            const expanded = Boolean(expandedIds[actionId]);
            const canExpand = action.text.length > 120;

            return (
              <li key={`${action.text}-${idx}`} className="flex" style={{ gap: 8, alignItems: "flex-start" }}>
                <span className="font-mono-dm" style={{ width: 22, height: 22, borderRadius: "50%", background: c.surfaceAlt, border: `1px solid ${c.border}`, color: c.t2, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {idx + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: c.t1,
                      lineHeight: 1.5,
                      ...(expanded ? {} : lineClamp(3)),
                    }}
                  >
                    {action.text}
                  </div>
                  {(action.sourceIdx !== undefined || canExpand) && (
                    <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 6 }}>
                      {action.sourceIdx !== undefined && (
                        <SourceChip citation={citations[action.sourceIdx - 1]} index={action.sourceIdx} onClick={onCit ? () => onCit(action.sourceIdx!) : undefined} />
                      )}
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => setExpandedIds((prev) => ({ ...prev, [actionId]: !prev[actionId] }))}
                          style={{
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            fontSize: 10,
                            fontWeight: 700,
                            color: c.t2,
                            cursor: "pointer",
                          }}
                        >
                          {expanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Placeholder text="Next actions will be generated from the scan" theme={theme} />
      )}
    </div>
  );
}

function FreshnessPill({ at, theme }: { at: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      title={new Date(at).toLocaleString()}
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: c.t2,
        padding: "5px 9px",
        borderRadius: 99,
        background: c.surfaceAlt,
        border: `1px solid ${c.border}`,
      }}
    >
      Last scan {formatRelativeTime(at)}
    </span>
  );
}

function DiffPill({ count, onClick, active }: { count: number; theme: "light" | "dark"; onClick: () => void; active: boolean }) {
  const accent = active ? "#2a2a2a" : "#111111";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "white",
        padding: "2px 8px",
        borderRadius: 99,
        background: accent,
        border: "none",
        cursor: "pointer",
      }}
    >
      {count} change{count === 1 ? "" : "s"}
    </button>
  );
}

function DiffPanel({
  diff,
  theme,
  onDismiss,
  onClose,
}: {
  diff: BriefDiffSnapshot;
  theme: "light" | "dark";
  onDismiss: () => void;
  onClose: () => void;
}) {
  const c = ddTheme(theme);
  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 24,
        padding: "16px",
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.t1, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Changes since {diff.previousAt ? formatRelativeTime(diff.previousAt) : "previous run"}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: c.t3, cursor: "pointer", fontSize: 11 }}
        >
          Hide
        </button>
        <button
          onClick={onDismiss}
          style={{ background: "transparent", border: "none", color: c.t3, cursor: "pointer", fontSize: 11 }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
        {diff.changes.map((change, idx) => (
          <DiffRow key={`${change.panel}-${change.label}-${idx}`} change={change} theme={theme} />
        ))}
      </div>
    </div>
  );
}

function DiffRow({ change, theme }: { change: FieldDiff; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  const tone = change.kind === "added" ? "#16a34a" : change.kind === "removed" ? "#ef4444" : "#f59e0b";
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 18,
        background: c.surfaceAlt,
        border: `1px solid ${c.border}`,
        minWidth: 0,
      }}
    >
      <div className="flex items-center" style={{ gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {change.kind}
        </span>
        <span style={{ fontSize: 10, color: c.t3 }}>{change.panelLabel}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.t1, marginBottom: 4 }}>{change.label}</div>
      {change.kind !== "added" && (
        <div style={{ fontSize: 11, color: c.t2, lineHeight: 1.35, textDecoration: "line-through", overflowWrap: "anywhere" }}>{change.before}</div>
      )}
      {change.kind !== "removed" && (
        <div style={{ fontSize: 11, color: c.t1, lineHeight: 1.35, overflowWrap: "anywhere" }}>{change.after}</div>
      )}
    </div>
  );
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function diffPanel(
  panel: "snapshot" | "transaction",
  panelLabel: string,
  before: BriefField[],
  after: BriefField[]
): FieldDiff[] {
  const beforeMap = new Map(before.map((f) => [f.label.toLowerCase(), f]));
  const afterMap = new Map(after.map((f) => [f.label.toLowerCase(), f]));
  const changes: FieldDiff[] = [];

  for (const [key, afterField] of Array.from(afterMap.entries())) {
    const beforeField = beforeMap.get(key);
    if (!beforeField) {
      if (!isNotFound(afterField.value)) {
        changes.push({ panel, panelLabel, label: afterField.label, before: "", after: afterField.value, kind: "added" });
      }
      continue;
    }
    if (afterField.override || beforeField.override) continue; // analyst-controlled fields don't count as scan changes
    if (normalizeForCompare(beforeField.value) !== normalizeForCompare(afterField.value)) {
      const beforeNF = isNotFound(beforeField.value);
      const afterNF = isNotFound(afterField.value);
      if (beforeNF && afterNF) continue;
      if (beforeNF) changes.push({ panel, panelLabel, label: afterField.label, before: "", after: afterField.value, kind: "added" });
      else if (afterNF) changes.push({ panel, panelLabel, label: afterField.label, before: beforeField.value, after: "", kind: "removed" });
      else changes.push({ panel, panelLabel, label: afterField.label, before: beforeField.value, after: afterField.value, kind: "changed" });
    }
  }
  for (const [key, beforeField] of Array.from(beforeMap.entries())) {
    if (afterMap.has(key)) continue;
    if (isNotFound(beforeField.value)) continue;
    changes.push({ panel, panelLabel, label: beforeField.label, before: beforeField.value, after: "", kind: "removed" });
  }
  return changes;
}

function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isNotFound(value: string): boolean {
  return /^not\s+found$/i.test(value.trim());
}

function StatusPill({ completed, total, loading, theme }: { completed: number; total: number; loading: boolean; theme: "light" | "dark" }) {
  const done = total > 0 && completed === total;
  const color = loading ? "#111111" : done ? "#16a34a" : "#f59e0b";
  const label = loading ? "Scanning" : done ? "Complete" : completed > 0 ? `${completed}/${total} complete` : "Not run";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color,
        padding: "5px 9px",
        borderRadius: 99,
        background: theme === "dark" ? `${color}22` : `${color}14`,
        border: `1px solid ${color}44`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function SourcePill({ count, theme }: { count: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <span style={{ fontSize: 11, color: c.t2, padding: "6px 10px", borderRadius: 99, background: c.surfaceAlt, border: `1px solid ${c.border}` }}>
      {count} source{count === 1 ? "" : "s"}
    </span>
  );
}

function CountBadge({ label, count, theme }: { label: string; count: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.t2, padding: "5px 8px", borderRadius: 99, border: `1px solid ${c.border}`, background: c.surfaceAlt }}>
      {count} {label}
    </span>
  );
}

function SeverityDot({ severity }: { severity: FindingSeverity }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV_COLOR[severity].dot, flexShrink: 0 }} />;
}

function BulletList({ items, theme }: { items: string[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
      {items.map((item, idx) => (
        <li key={`${item}-${idx}`} className="flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12, color: c.t1, lineHeight: 1.4 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT, marginTop: 6, flexShrink: 0 }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Placeholder({ text, theme }: { text: string; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div style={{ height: "100%", minHeight: 92, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: c.t3, textAlign: "center" }}>
      {text}
    </div>
  );
}

function resultByLabel(
  workstream: BriefWorkstreamShim | null,
  results: Record<string, QuestionResult>,
  label: string
): QuestionResult | undefined {
  const query = workstream?.templates.find((template) => template.label === label)?.query;
  return query ? results[query] : undefined;
}

function cleanText(text = ""): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\[Source\s+\d+\]/gi, "")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * Build the snapshot/transaction fields straight from the KV cell's typed
 * `answer_formatted.pairs`. Only keys in `preferredLabels` are surfaced (same
 * whitelist the old prose regex enforced); values are title-cased and
 * unit-joined. Returns [] when the cell has no typed pairs (old runs) so the
 * panel falls back to rendering `answer` as markdown.
 */
function pairsToFields(formatted: QuestionResult["formatted"], preferredLabels: string[]): BriefField[] {
  if (!formatted || typeof formatted !== "object" || Array.isArray(formatted)) return [];
  const pairs = (formatted as { pairs?: Array<{ key?: string; value?: string | number; unit?: string | null }> }).pairs;
  if (!Array.isArray(pairs)) return [];
  const allow = new Set(preferredLabels.map((l) => l.toLowerCase()));
  const fields: BriefField[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const key = (pair?.key ?? "").trim();
    if (!key || !allow.has(key.toLowerCase())) continue;
    const label = titleCase(key);
    if (seen.has(label.toLowerCase())) continue;
    const rawValue = pair?.value;
    if (rawValue == null || rawValue === "") continue;
    const unit = (pair?.unit ?? "").trim();
    // The LLM sometimes tucks the "[Source N]" marker into `unit`, so build the
    // combined string first, then pull the source index and strip the marker —
    // mirroring the old synthesize(value+unit) → extractFields behavior.
    const combined = `${rawValue}${unit ? ` ${unit}` : ""}`;
    const sourceIdx = extractFirstSourceIdx(combined);
    const value = normalizeValue(combined.replace(/\[Source\s+\d+\]/gi, ""));
    if (!value) continue;
    seen.add(label.toLowerCase());
    fields.push({ label, value, sourceIdx });
  }
  return fields.slice(0, 7);
}

function extractMetrics(answer: string | undefined): Metric[] {
  const text = cleanText(answer);
  if (!text) return [];
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").replace(/^\|+|\|+$/g, "").trim())
    .filter(Boolean);
  const metrics: Metric[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*\|\s*/g, " | ");
    const keyword = METRIC_KEYWORDS.find((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`, "i").test(line));
    if (!keyword) continue;
    const values = line.match(VALUE_PATTERN);
    if (!values?.length) continue;
    const label = inferMetricLabel(line, keyword);
    const key = `${label}:${values[0]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    metrics.push({
      label,
      value: values.slice(0, 3).join(" / "),
      context: line.replace(/\s+/g, " ").slice(0, 90),
    });
    if (metrics.length >= 10) break;
  }

  return metrics;
}

function extractFinancialTables(answer: string | undefined): FinancialTable[] {
  const text = cleanText(answer);
  if (!text) return [];
  const lines = text.split("\n");
  const tables: FinancialTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!isMarkdownTableLine(line)) continue;

    const title = inferTableTitle(lines, i);
    const block: string[] = [];
    while (i < lines.length && isMarkdownTableLine(lines[i].trim())) {
      block.push(lines[i].trim());
      i += 1;
    }

    const parsed = parseMarkdownTable(block, title);
    if (parsed && parsed.headers.length >= 2 && parsed.rows.length > 0) {
      tables.push(parsed);
    }
  }

  return tables.slice(0, 4);
}

function isMarkdownTableLine(line: string): boolean {
  return line.includes("|") && line.split("|").length >= 3;
}

function inferTableTitle(lines: string[], tableStart: number): string {
  for (let i = tableStart - 1; i >= Math.max(0, tableStart - 4); i--) {
    const candidate = lines[i]
      .replace(/^#+\s*/, "")
      .replace(/^\s*[-*]\s*/, "")
      .trim();
    if (!candidate || isMarkdownTableLine(candidate) || /^:?-{3,}:?$/.test(candidate)) continue;
    if (candidate.length <= 70) return titleCase(candidate);
  }
  return "Financials";
}

function parseMarkdownTable(lines: string[], title: string): FinancialTable | null {
  if (lines.length < 2) return null;
  const rows = lines
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => normalizeTableCell(cell))
    )
    .filter((row) => row.some(Boolean));
  if (rows.length < 2) return null;

  const headers = rows[0];
  const body = rows
    .slice(1)
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map((row) => {
      const normalized = [...row];
      while (normalized.length < headers.length) normalized.push("");
      return normalized.slice(0, headers.length);
    });
  if (body.length === 0) return null;
  return { title, headers, rows: body };
}

function normalizeTableCell(value: string): string {
  return value
    .replace(/\[Source\s+\d+\]/gi, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildChartSeries(table: FinancialTable): ChartSeries[] {
  if (table.headers.length < 3) return [];
  const periodHeaders = table.headers.slice(1);
  const candidateRows = table.rows.filter((row) => {
    const label = row[0] || "";
    const numericCount = row.slice(1).filter((cell) => parseFinancialNumber(cell) !== null).length;
    return numericCount >= 2 && /revenue|sales|gross profit|ebitda|income|cash flow|arr|margin/i.test(label);
  });

  return candidateRows.slice(0, 4).map((row) => ({
    label: shortenLabel(row[0] || "Metric"),
    values: periodHeaders
      .map((period, idx) => {
        const display = row[idx + 1] || "";
        const value = parseFinancialNumber(display);
        if (value === null) return null;
        return { period: shortenPeriod(period), value, display };
      })
      .filter((point): point is ChartPoint => point !== null),
  })).filter((series) => series.values.length >= 2);
}

function parseFinancialNumber(value: string): number | null {
  const cleaned = value
    .replace(/\[Source\s+\d+\]/gi, "")
    .replace(/[$€£,%x]/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned || /^n\/?a$/i.test(cleaned) || /notfound/i.test(cleaned)) return null;
  const negative = /^\(.+\)$/.test(cleaned) || /^-/.test(cleaned);
  const magnitude = /bn|b$/i.test(cleaned) ? 1000 : /k$/i.test(cleaned) ? 0.001 : 1;
  const normalized = cleaned.replace(/[(),]/g, "").replace(/mm|m|bn|b|k/gi, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return (negative ? -1 : 1) * parsed * magnitude;
}

function shortenLabel(label: string): string {
  const cleaned = titleCase(label.replace(/\s*\([^)]*\)/g, ""));
  if (/Adjusted EBITDA/i.test(cleaned)) return "Adj. EBITDA";
  if (/EBITDA Margin/i.test(cleaned)) return "EBITDA %";
  if (/Gross Margin/i.test(cleaned)) return "Gross %";
  return cleaned.length > 18 ? cleaned.slice(0, 16) + "..." : cleaned;
}

function shortenPeriod(period: string): string {
  return period.replace(/Fiscal Year|FY|Calendar Year/gi, "").replace(/\s+/g, " ").trim();
}

function inferMetricLabel(line: string, keyword: string): string {
  const colonLabel = line.split(/[:|]/)[0]?.trim();
  if (colonLabel && colonLabel.length <= 34 && /[a-z]/i.test(colonLabel)) return titleCase(colonLabel);
  return keyword;
}

function extractBullets(answer: string | undefined): string[] {
  const text = cleanText(answer);
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter((line) => line.length > 18 && !/^#+\s/.test(line))
    .map((line) => (line.length > 150 ? line.slice(0, 147) + "..." : line))
    .slice(0, 6);
}

function mergeOverrides(
  fields: BriefField[],
  overridesForPanel: Record<string, string> | undefined,
  preferredOrder: string[]
): BriefField[] {
  if (!overridesForPanel || Object.keys(overridesForPanel).length === 0) return fields;
  const lower = (s: string) => s.toLowerCase();
  const remaining = new Map<string, { label: string; value: string }>();
  for (const [label, value] of Object.entries(overridesForPanel)) {
    remaining.set(lower(label), { label, value });
  }
  const merged = fields.map((field) => {
    const hit = remaining.get(lower(field.label));
    if (!hit) return field;
    remaining.delete(lower(field.label));
    return { ...field, value: hit.value, sourceIdx: undefined, override: true };
  });
  // Append remaining overrides in preferred-label order first, then anything left
  for (const label of preferredOrder) {
    const hit = remaining.get(lower(label));
    if (!hit) continue;
    merged.push({ label: hit.label, value: hit.value, override: true });
    remaining.delete(lower(label));
  }
  for (const { label, value } of Array.from(remaining.values())) {
    merged.push({ label, value, override: true });
  }
  return merged;
}

function extractFirstSourceIdx(text: string): number | undefined {
  const match = text.match(/\[Source\s+(\d+)\]/i);
  if (!match) return undefined;
  const idx = Number.parseInt(match[1], 10);
  return Number.isFinite(idx) && idx > 0 ? idx : undefined;
}

function extractBulletsWithSources(answer: string | undefined): ThesisBullet[] {
  if (!answer) return [];
  const sanitized = answer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!sanitized) return [];
  const lines = sanitized
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter((line) => line.length > 12 && !/^#+\s/.test(line) && !/^[A-Z][A-Za-z ]+:\s*$/.test(line));
  const bullets: ThesisBullet[] = [];
  for (const raw of lines) {
    const sourceIdx = extractFirstSourceIdx(raw);
    const text = raw.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
    if (!text || /^not\s+found$/i.test(text)) continue;
    bullets.push({ text, sourceIdx });
  }
  return bullets;
}

const THESIS_SECTION_HEADINGS: Array<{ key: keyof ThesisSections; pattern: RegExp }> = [
  { key: "thesis", pattern: /^thesis\b/i },
  { key: "levers", pattern: /^value\s*creation\s*levers\b/i },
  { key: "exit", pattern: /^exit\s*considerations\b/i },
  { key: "risks", pattern: /^risks?\s*(?:to\s*thesis)?\b/i },
];

function extractThesisSections(answer: string | undefined): ThesisSections {
  const empty: ThesisSections = { thesis: [], levers: [], exit: [], risks: [] };
  if (!answer) return empty;
  const sanitized = answer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*/g, "")
    .trim();
  if (!sanitized) return empty;

  const sections: ThesisSections = { thesis: [], levers: [], exit: [], risks: [] };
  let current: keyof ThesisSections | null = null;
  for (const rawLine of sanitized.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const heading = trimmed.replace(/^\s*[-*]\s*/, "").replace(/^#+\s*/, "");
    const matched = THESIS_SECTION_HEADINGS.find((h) => h.pattern.test(heading));
    if (matched && /:|—|–/.test(heading) === false && /^[A-Za-z ]+$/.test(heading.split(/[:—–]/)[0])) {
      // pure heading line like "Thesis" or "Value creation levers"
      current = matched.key;
      continue;
    }
    if (matched && /^[A-Za-z][^:]+:/.test(heading)) {
      // heading with inline content e.g. "Thesis: foo" — switch section and treat the rest as the first bullet
      current = matched.key;
      const inline = heading.split(/:\s*/).slice(1).join(": ").trim();
      if (inline) {
        const sourceIdx = extractFirstSourceIdx(inline);
        const text = inline.replace(/\[Source\s+\d+\]/gi, "").trim();
        if (text && !/^not\s+found$/i.test(text)) sections[current].push({ text, sourceIdx });
      }
      continue;
    }
    if (!current) continue;
    const bulletText = trimmed.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim();
    if (!bulletText || /^not\s+found$/i.test(bulletText)) continue;
    const sourceIdx = extractFirstSourceIdx(bulletText);
    const text = bulletText.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const truncated = text.length > 180 ? text.slice(0, 177) + "..." : text;
    sections[current].push({ text: truncated, sourceIdx });
  }
  return sections;
}

function deriveActions(
  formatted: QuestionResult["formatted"],
  answer: string | undefined,
  findings: Finding[]
): ThesisBullet[] {
  // Prefer the list cell's typed items; fall back to bullet-parsing the raw
  // answer for old runs whose cells have no answer_formatted.
  let explicit: ThesisBullet[] = [];
  if (formatted && typeof formatted === "object" && !Array.isArray(formatted)) {
    const items = (formatted as { items?: Array<{ text?: string } | string> }).items;
    if (Array.isArray(items)) {
      for (const item of items) {
        const rawText = typeof item === "string" ? item : item?.text ?? "";
        const sourceIdx = extractFirstSourceIdx(rawText);
        const text = rawText.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
        if (text && !/^not\s+found$/i.test(text)) explicit.push({ text, sourceIdx });
      }
    }
  }
  if (explicit.length === 0) explicit = extractBulletsWithSources(answer);
  explicit = explicit.slice(0, 5);
  if (explicit.length > 0) return explicit;

  const fallbacks: ThesisBullet[] = [];
  if (findings.some((finding) => finding.sev === "deal-breaker")) {
    fallbacks.push({ text: "Validate deal-breaker findings against source documents and size the potential downside." });
  }
  if (findings.some((finding) => finding.sev === "material")) {
    fallbacks.push({ text: "Build mitigation asks for material findings before the next deal team discussion." });
  }
  if (findings.some(isGapFinding)) {
    fallbacks.push({ text: "Request missing VDR materials and unresolved disclosures flagged by the scan." });
  }
  if (findings.some(isInconsistencyFinding)) {
    fallbacks.push({ text: "Reconcile conflicting metrics across the CIM, financials, QoE, and model." });
  }
  if (fallbacks.length === 0 && findings.length > 0) {
    fallbacks.push({ text: "Review scan findings and route each item to the relevant diligence workstream." });
  }
  return fallbacks;
}

function countSources(results: Array<QuestionResult | undefined>): number {
  const sources = new Set<string>();
  for (const result of results) {
    for (const citation of result?.citations || []) {
      if (!citation) continue;
      sources.add(`${citation.source_file}:${citation.page}`);
    }
  }
  return sources.size;
}

function compareFindingSeverity(a: Finding, b: Finding): number {
  return severityRank(b.sev) - severityRank(a.sev);
}

function severityRank(severity: FindingSeverity): number {
  if (severity === "deal-breaker") return 3;
  if (severity === "material") return 2;
  return 1;
}

function isGapFinding(finding: Finding): boolean {
  return /gap|missing|absent|unprovided|incomplete|omission/i.test(`${finding.title} ${finding.detail}`);
}

function isInconsistencyFinding(finding: Finding): boolean {
  return /inconsisten|conflict|mismatch|reconcile|differ|contradict/i.test(`${finding.title} ${finding.detail}`);
}

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^not\s+found$/i, "Not found").trim();
}

function titleCase(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .replace(/\bEbitda\b/g, "EBITDA")
    .replace(/\bArr\b/g, "ARR")
    .replace(/\bMrr\b/g, "MRR");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
