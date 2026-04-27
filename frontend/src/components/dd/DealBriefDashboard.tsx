"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Workstream } from "@/lib/queryTemplates";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import type { Citation, WorkstreamEvent } from "@/lib/api";
import { workstreamStream } from "@/lib/api";
import type { Finding, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;
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
  workstreams: Workstream[];
  resultCache: WorkstreamCache;
  findings: Finding[];
  theme: "light" | "dark";
  onOpenProactiveScan: () => void;
  onSelectFinding: (finding: Finding) => void;
  onCit?: (citation: Citation, id: string) => void;
  onCacheUpdate?: (workstreamId: string, results: Record<string, QuestionResult>) => void;
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
  workstreams,
  resultCache,
  findings,
  theme,
  onOpenProactiveScan,
  onSelectFinding,
  onCit,
  onCacheUpdate,
}: Props) {
  const c = ddTheme(theme);
  const scanWorkstream = workstreams.find((w) => w.id === "proactive_scan");
  const scanResults = resultCache.proactive_scan || {};
  const scanTemplates = scanWorkstream?.templates || [];
  const completed = scanTemplates.filter((template) => scanResults[template.query]?.status === "complete").length;
  const total = scanTemplates.length;
  const scanStarted = Object.values(scanResults).some((result) => result.status !== "pending");
  const isLoading = Object.values(scanResults).some((result) => result.status === "loading");

  const [overrides, setOverrides] = useState<OverrideStore>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(OVERRIDE_KEY_PREFIX + dealId);
      setOverrides(raw ? JSON.parse(raw) : {});
    } catch {
      setOverrides({});
    }
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
        try {
          if (typeof window !== "undefined") {
            if (Object.keys(next).length > 0) localStorage.setItem(OVERRIDE_KEY_PREFIX + dealId, JSON.stringify(next));
            else localStorage.removeItem(OVERRIDE_KEY_PREFIX + dealId);
          }
        } catch {}
        return next;
      });
    },
    [dealId]
  );

  const snapshotResult = resultByLabel(scanWorkstream, scanResults, DEAL_SNAPSHOT_LABEL);
  const transactionResult = resultByLabel(scanWorkstream, scanResults, PROPOSED_TRANSACTION_LABEL);
  const financialResult = resultByLabel(scanWorkstream, scanResults, FINANCIAL_HIGHLIGHTS_LABEL);
  const thesisResult = resultByLabel(scanWorkstream, scanResults, INVESTMENT_THESIS_LABEL);
  const nextActionsResult = resultByLabel(scanWorkstream, scanResults, NEXT_ACTIONS_LABEL);

  const snapshotFields = mergeOverrides(
    extractFields(snapshotResult?.answer, SNAPSHOT_FIELDS),
    overrides.snapshot,
    SNAPSHOT_FIELDS
  );
  const transactionFields = mergeOverrides(
    extractFields(transactionResult?.answer, TRANSACTION_FIELDS),
    overrides.transaction,
    TRANSACTION_FIELDS
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
  const controllerRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

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
    if (rerunning || !scanWorkstream || !onCacheUpdate) return;
    const queries = scanWorkstream.templates.map((t) => t.query);
    if (queries.length === 0) return;

    beforeSnapshotRef.current = {
      snapshot: snapshotFields.map((f) => ({ ...f })),
      transaction: transactionFields.map((f) => ({ ...f })),
      previousAt: lastScanAt ?? undefined,
    };

    let working: Record<string, QuestionResult> = {};
    for (const q of queries) {
      working[q] = { answer: "", citations: [], status: "loading" };
    }
    onCacheUpdate("proactive_scan", working);
    setRerunning(true);

    const handleEvent = (event: WorkstreamEvent) => {
      const q = event.question;
      if (event.type === "token") {
        const prev = working[q] || { answer: "", citations: [], status: "loading" };
        working = {
          ...working,
          [q]: { ...prev, answer: prev.answer + event.token, status: "loading" },
        };
      } else if (event.type === "done") {
        working = {
          ...working,
          [q]: {
            answer: event.answer,
            citations: event.citations,
            status: "complete",
            model: event.model,
            fallback: event.fallback,
            duration_ms: event.duration_ms,
            completed_at: Date.now(),
          },
        };
      } else if (event.type === "error") {
        working = { ...working, [q]: { answer: event.error, citations: [], status: "error" } };
      }
      onCacheUpdate("proactive_scan", working);
    };

    controllerRef.current?.abort();
    controllerRef.current = workstreamStream(
      dealId,
      "proactive_scan",
      queries,
      handleEvent,
      () => {
        setRerunning(false);
        const before = beforeSnapshotRef.current;
        if (!before) return;
        const newSnapshotFields = mergeOverrides(
          extractFields(working[scanWorkstream.templates.find((t) => t.label === DEAL_SNAPSHOT_LABEL)?.query || ""]?.answer, SNAPSHOT_FIELDS),
          overrides.snapshot,
          SNAPSHOT_FIELDS
        );
        const newTransactionFields = mergeOverrides(
          extractFields(working[scanWorkstream.templates.find((t) => t.label === PROPOSED_TRANSACTION_LABEL)?.query || ""]?.answer, TRANSACTION_FIELDS),
          overrides.transaction,
          TRANSACTION_FIELDS
        );
        const changes = [
          ...diffPanel("snapshot", "Deal Snapshot", before.snapshot, newSnapshotFields),
          ...diffPanel("transaction", "Proposed Transaction", before.transaction, newTransactionFields),
        ];
        const next: BriefDiffSnapshot = { changes, at: Date.now(), previousAt: before.previousAt };
        persistDiff(next);
        if (changes.length > 0) setDiffOpen(true);
      },
      (err) => {
        console.error("brief rerun error:", err);
        setRerunning(false);
      }
    );
  }, [dealId, lastScanAt, onCacheUpdate, overrides.snapshot, overrides.transaction, persistDiff, rerunning, scanWorkstream, snapshotFields, transactionFields]);

  const dismissDiff = useCallback(() => {
    persistDiff(null);
    setDiffOpen(false);
  }, [persistDiff]);
  const metrics = extractMetrics(financialResult?.answer);
  const financialTables = extractFinancialTables(financialResult?.answer);
  const thesisSections = extractThesisSections(thesisResult?.answer);
  const nextActions = extractActionItems(nextActionsResult?.answer, findings);
  const topFindings = findings.slice().sort(compareFindingSeverity).slice(0, 4);
  const gapCount = findings.filter(isGapFinding).length;
  const inconsistencyCount = findings.filter(isInconsistencyFinding).length;
  const sourceCount = countSources([snapshotResult, transactionResult, financialResult, thesisResult, nextActionsResult]);

  const handleCit = (sourceIdx: number | undefined, citations: (Citation | null)[], idPrefix: string) => {
    if (!onCit || !sourceIdx) return;
    const citation = citations[sourceIdx - 1];
    if (citation) onCit(citation, `${idPrefix}-src-${sourceIdx}`);
  };

  return (
    <section
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap: 12,
          padding: "16px 18px",
          borderBottom: `1px solid ${c.border}`,
          background: theme === "dark" ? "#111827" : "#ffffff",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: c.t1 }}>Deal Brief</span>
            <StatusPill completed={completed} total={total} loading={isLoading || rerunning} theme={theme} />
            {lastScanAt && <FreshnessPill at={lastScanAt} theme={theme} />}
            {diff && diff.changes.length > 0 && (
              <DiffPill
                count={diff.changes.length}
                theme={theme}
                onClick={() => setDiffOpen((v) => !v)}
                active={diffOpen}
              />
            )}
          </div>
          <div style={{ fontSize: 12, color: c.t2 }}>
            Snapshot, proposed transaction, financial highlights, findings, and next diligence actions
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
          {sourceCount > 0 && <SourcePill count={sourceCount} theme={theme} />}
          {scanStarted && onCacheUpdate && (
            <button
              onClick={handleRerun}
              disabled={rerunning}
              title="Re-run the proactive scan"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: rerunning ? c.t3 : c.t1,
                background: theme === "dark" ? "#0f172a" : "#f8fafc",
                border: `1px solid ${c.border}`,
                borderRadius: 6,
                padding: "6px 10px",
                cursor: rerunning ? "default" : "pointer",
              }}
            >
              {rerunning ? "Re-running…" : "↻ Re-run"}
            </button>
          )}
          <button
            onClick={onOpenProactiveScan}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "white",
              background: ACCENT,
              border: "none",
              borderRadius: 6,
              padding: "7px 11px",
              cursor: "pointer",
            }}
          >
            {scanStarted ? "Open Scan" : "Run Scan"}
          </button>
        </div>
      </div>

      {diff && diffOpen && diff.changes.length > 0 && (
        <DiffPanel diff={diff} theme={theme} onDismiss={dismissDiff} onClose={() => setDiffOpen(false)} />
      )}

      <div style={{ padding: 18 }}>
        {!scanStarted ? (
          <EmptyBrief theme={theme} onOpenProactiveScan={onOpenProactiveScan} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
              <BriefPanel
                title="What Is The Deal?"
                panelKey="snapshot"
                fields={snapshotFields}
                fallback={snapshotResult?.answer}
                theme={theme}
                onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, snapshotResult?.citations || [], "snapshot") : undefined}
                onOverride={setOverride}
              />
              <BriefPanel
                title="What Is Being Proposed?"
                panelKey="transaction"
                fields={transactionFields}
                fallback={transactionResult?.answer}
                theme={theme}
                onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, transactionResult?.citations || [], "transaction") : undefined}
                onOverride={setOverride}
              />
              <FinancialPanel
                metrics={metrics}
                tables={financialTables}
                fallback={financialResult?.answer}
                theme={theme}
              />
            </div>

            <ThesisPanel
              sections={thesisSections}
              fallback={thesisResult?.answer}
              theme={theme}
              onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, thesisResult?.citations || [], "thesis") : undefined}
              loading={thesisResult?.status === "loading"}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 12 }}>
              <FindingsPanel
                findings={topFindings}
                gapCount={gapCount}
                inconsistencyCount={inconsistencyCount}
                theme={theme}
                onSelectFinding={onSelectFinding}
              />
              <ActionsPanel
                actions={nextActions}
                theme={theme}
                onCit={onCit ? (sourceIdx) => handleCit(sourceIdx, nextActionsResult?.citations || [], "actions") : undefined}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function EmptyBrief({ theme, onOpenProactiveScan }: { theme: "light" | "dark"; onOpenProactiveScan: () => void }) {
  const c = ddTheme(theme);
  return (
    <div
      className="flex items-center"
      style={{
        gap: 16,
        padding: "16px 18px",
        border: `1px dashed ${c.border}`,
        borderRadius: 8,
        background: theme === "dark" ? "#0f172a" : "#f8fafc",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: c.t1, marginBottom: 4 }}>No Deal Brief yet</div>
        <div style={{ fontSize: 12, color: c.t2 }}>
          Run the proactive scan to extract the target profile, transaction terms, financial highlights, and diligence actions from the VDR.
        </div>
      </div>
      <button
        onClick={onOpenProactiveScan}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: ACCENT,
          background: theme === "dark" ? "#172554" : "#eff6ff",
          border: `1px solid ${theme === "dark" ? "#1d4ed8" : "#bfdbfe"}`,
          borderRadius: 6,
          padding: "7px 11px",
          cursor: "pointer",
        }}
      >
        Start Scan
      </button>
    </div>
  );
}

function BriefPanel({
  title,
  panelKey,
  fields,
  fallback,
  theme,
  onCit,
  onOverride,
}: {
  title: string;
  panelKey: string;
  fields: BriefField[];
  fallback?: string;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  onOverride?: (panelKey: string, label: string, value: string | null) => void;
}) {
  const c = ddTheme(theme);
  const fallbackItems = fields.length === 0 ? extractBullets(fallback).slice(0, 4) : [];

  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc", minHeight: 168 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: c.t1, marginBottom: 10 }}>{title}</div>
      {fields.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {fields.slice(0, 6).map((field) => (
            <EditableField
              key={`${panelKey}-${field.label}`}
              field={field}
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
  theme,
  onCit,
  onSave,
}: {
  field: BriefField;
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
      style={{ minWidth: 0 }}
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
            marginTop: 2,
            padding: "4px 6px",
            fontSize: 12,
            color: c.t1,
            background: theme === "dark" ? "#020617" : "#ffffff",
            border: `1px solid ${ACCENT}`,
            borderRadius: 4,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <div
          onClick={editable ? () => setEditing(true) : undefined}
          style={{
            fontSize: 12,
            color: field.override ? c.t1 : c.t1,
            lineHeight: 1.35,
            overflowWrap: "anywhere",
            cursor: editable ? "text" : "default",
            fontStyle: field.override ? "normal" : undefined,
          }}
        >
          {field.value}
          {field.sourceIdx !== undefined && (
            <SourceChip index={field.sourceIdx} onClick={onCit ? () => onCit(field.sourceIdx!) : undefined} />
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
        borderRadius: 3,
        padding: "0 4px",
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
}: {
  metrics: Metric[];
  tables: FinancialTable[];
  fallback?: string;
  theme: "light" | "dark";
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
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc", minHeight: 168 }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.t1 }}>Key Financial Data</div>
        <div style={{ flex: 1 }} />
        <SegmentedTabs
          options={[
            { id: "annual", label: "Annual", disabled: !annualTable },
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
    <div className="flex items-center" style={{ gap: 2, padding: 2, borderRadius: 6, background: theme === "dark" ? "#111827" : "#ffffff", border: `1px solid ${c.borderLight}` }}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            disabled={option.disabled}
            style={{
              border: "none",
              borderRadius: 4,
              padding: "3px 7px",
              fontSize: 10,
              fontWeight: 700,
              color: option.disabled ? c.t4 : active ? "white" : c.t2,
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
    <div style={{ padding: 10, borderRadius: 6, background: theme === "dark" ? "#111827" : "#ffffff", border: `1px solid ${c.borderLight}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, marginBottom: 8, textTransform: "uppercase" }}>Trend Chart</div>
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
    <div style={{ borderRadius: 6, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#111827" : "#ffffff", overflow: "hidden" }}>
      <div style={{ padding: "7px 9px", borderBottom: `1px solid ${c.borderLight}`, fontSize: 11, fontWeight: 700, color: c.t1 }}>
        {table.title}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
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
                    borderBottom: `1px solid ${c.borderLight}`,
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
                      borderBottom: rIdx === table.rows.length - 1 ? "none" : `1px solid ${c.borderLight}`,
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
    <div style={{ borderRadius: 6, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#111827" : "#ffffff", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Metric", "Value", "Context"].map((header, idx) => (
              <th key={header} style={{ padding: "7px 8px", textAlign: idx === 1 ? "right" : "left", fontSize: 10, fontWeight: 700, color: c.t3, borderBottom: `1px solid ${c.borderLight}` }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.slice(0, 8).map((metric, idx) => (
            <tr key={`${metric.label}-${idx}`}>
              <td style={{ padding: "7px 8px", fontSize: 11, fontWeight: 700, color: c.t1, borderBottom: `1px solid ${c.borderLight}` }}>{metric.label}</td>
              <td className="font-mono-dm" style={{ padding: "7px 8px", fontSize: 11, color: c.t1, textAlign: "right", borderBottom: `1px solid ${c.borderLight}`, whiteSpace: "nowrap" }}>{metric.value}</td>
              <td style={{ padding: "7px 8px", fontSize: 10, color: c.t2, borderBottom: `1px solid ${c.borderLight}` }}>{metric.context}</td>
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
    <div style={{ borderRadius: 6, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#111827" : "#ffffff", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {items.map((item, idx) => {
            const [label, ...rest] = item.split(":");
            return (
              <tr key={`${item}-${idx}`}>
                <td style={{ padding: "8px 9px", fontSize: 11, fontWeight: 700, color: c.t1, width: "34%", borderBottom: `1px solid ${c.borderLight}` }}>{rest.length ? label : `Item ${idx + 1}`}</td>
                <td style={{ padding: "8px 9px", fontSize: 11, color: c.t2, borderBottom: `1px solid ${c.borderLight}` }}>{rest.length ? rest.join(":").trim() : item}</td>
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
}: {
  findings: Finding[];
  gapCount: number;
  inconsistencyCount: number;
  theme: "light" | "dark";
  onSelectFinding: (finding: Finding) => void;
}) {
  const c = ddTheme(theme);

  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc" }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.t1 }}>What Matters Most</div>
        <div style={{ flex: 1 }} />
        <CountBadge label="Gaps" count={gapCount} theme={theme} />
        <CountBadge label="Mismatches" count={inconsistencyCount} theme={theme} />
      </div>
      {findings.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {findings.map((finding) => (
            <button
              key={finding.id}
              onClick={() => onSelectFinding(finding)}
              style={{
                padding: 10,
                borderRadius: 6,
                background: theme === "dark" ? "#111827" : "#ffffff",
                border: `1px solid ${c.borderLight}`,
                minWidth: 0,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                <SeverityDot severity={finding.sev} />
                <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[finding.sev].color }}>{SEV_COLOR[finding.sev].label}</span>
                <span style={{ fontSize: 10, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{finding.src}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 650, color: c.t1, lineHeight: 1.35 }}>{finding.title}</div>
            </button>
          ))}
        </div>
      ) : (
        <Placeholder text="Scan findings will appear here" theme={theme} />
      )}
    </div>
  );
}

function ThesisPanel({
  sections,
  fallback,
  theme,
  onCit,
  loading,
}: {
  sections: ThesisSections;
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
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc" }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.t1 }}>Investment Thesis</div>
        {loading && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6" }}>Synthesizing…</span>
        )}
      </div>
      {hasAny ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {blocks.map((block) => (
            <ThesisColumn key={block.id} label={block.label} accent={block.accent} bullets={block.bullets} theme={theme} onCit={onCit} />
          ))}
        </div>
      ) : fallbackBullets.length > 0 ? (
        <ThesisColumn label="Synthesis" accent={ACCENT} bullets={fallbackBullets} theme={theme} onCit={onCit} />
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
  theme,
  onCit,
}: {
  label: string;
  accent: string;
  bullets: ThesisBullet[];
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
}) {
  const c = ddTheme(theme);
  if (bullets.length === 0) {
    return (
      <div style={{ padding: 10, borderRadius: 6, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#111827" : "#ffffff", minHeight: 92 }}>
        <ThesisColumnHeader label={label} accent={accent} theme={theme} />
        <div style={{ fontSize: 11, color: c.t3, fontStyle: "italic" }}>Not synthesized</div>
      </div>
    );
  }
  return (
    <div style={{ padding: 10, borderRadius: 6, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#111827" : "#ffffff" }}>
      <ThesisColumnHeader label={label} accent={accent} theme={theme} />
      <ul style={{ display: "flex", flexDirection: "column", gap: 7, margin: 0, padding: 0, listStyle: "none" }}>
        {bullets.slice(0, 5).map((bullet, idx) => (
          <li key={`${label}-${idx}`} className="flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12, color: c.t1, lineHeight: 1.4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, marginTop: 6, flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              {bullet.text}
              {bullet.sourceIdx !== undefined && (
                <SourceChip index={bullet.sourceIdx} onClick={onCit ? () => onCit(bullet.sourceIdx!) : undefined} />
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

function SourceChip({ index, onClick }: { index: number; onClick?: () => void }) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      disabled={!interactive}
      title={`Source ${index}`}
      style={{
        marginLeft: 4,
        padding: "0 4px",
        fontSize: 9,
        fontWeight: 700,
        color: "#1d4ed8",
        background: "#dbeafe",
        border: "none",
        borderRadius: 3,
        cursor: interactive ? "pointer" : "default",
        verticalAlign: "super",
        lineHeight: 1.2,
      }}
    >
      [{index}]
    </button>
  );
}

function ActionsPanel({ actions, theme, onCit }: { actions: ThesisBullet[]; theme: "light" | "dark"; onCit?: (sourceIdx: number) => void }) {
  const c = ddTheme(theme);
  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: c.t1, marginBottom: 10 }}>Analyst Next Actions</div>
      {actions.length > 0 ? (
        <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
          {actions.slice(0, 5).map((action, idx) => (
            <li key={`${action.text}-${idx}`} className="flex" style={{ gap: 8, alignItems: "flex-start" }}>
              <span className="font-mono-dm" style={{ width: 18, height: 18, borderRadius: "50%", background: theme === "dark" ? "#1e293b" : "#e2e8f0", color: c.t2, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {idx + 1}
              </span>
              <span style={{ fontSize: 12, color: c.t1, lineHeight: 1.4, minWidth: 0, flex: 1 }}>
                {action.text}
                {action.sourceIdx !== undefined && (
                  <SourceChip index={action.sourceIdx} onClick={onCit ? () => onCit(action.sourceIdx!) : undefined} />
                )}
              </span>
            </li>
          ))}
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
        padding: "2px 7px",
        borderRadius: 99,
        background: theme === "dark" ? "#0f172a" : "#f8fafc",
        border: `1px solid ${c.border}`,
      }}
    >
      Last scan {formatRelativeTime(at)}
    </span>
  );
}

function DiffPill({ count, theme, onClick, active }: { count: number; theme: "light" | "dark"; onClick: () => void; active: boolean }) {
  const accent = active ? "#1d4ed8" : "#2563eb";
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
        background: theme === "dark" ? "#0b1220" : "#eff6ff",
        borderBottom: `1px solid ${c.border}`,
        padding: "12px 18px",
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
        padding: "8px 10px",
        borderRadius: 6,
        background: theme === "dark" ? "#0f172a" : "#ffffff",
        border: `1px solid ${c.borderLight}`,
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
  const color = loading ? "#3b82f6" : done ? "#16a34a" : "#f59e0b";
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
        padding: "2px 7px",
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
    <span style={{ fontSize: 11, color: c.t2, padding: "5px 8px", borderRadius: 99, background: theme === "dark" ? "#0f172a" : "#f8fafc", border: `1px solid ${c.border}` }}>
      {count} source{count === 1 ? "" : "s"}
    </span>
  );
}

function CountBadge({ label, count, theme }: { label: string; count: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.t2, padding: "2px 6px", borderRadius: 99, border: `1px solid ${c.border}`, background: theme === "dark" ? "#111827" : "#ffffff" }}>
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
  workstream: Workstream | undefined,
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

function extractFields(answer: string | undefined, preferredLabels: string[]): BriefField[] {
  if (!answer) return [];
  const cleaned = answer.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "").trim();
  if (!cleaned) return [];
  const normalizedText = cleaned.replace(
    new RegExp(`;\\s*(?=(?:${preferredLabels.map(escapeRegExp).join("|")})\\s*:)`, "gi"),
    "\n"
  );
  const fields: BriefField[] = [];
  const seen = new Set<string>();
  const labelPattern = preferredLabels.map(escapeRegExp).join("|");
  const regex = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:${labelPattern})\\s*[:-]\\s*([^\\n]+)`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalizedText)) !== null) {
    const rawLabel = match[0]
      .replace(/^\s*[-*]\s*/, "")
      .split(/[:-]/)[0]
      .trim();
    const label = titleCase(rawLabel);
    const rawValue = match[1];
    const sourceIdx = extractFirstSourceIdx(rawValue);
    const value = normalizeValue(rawValue.replace(/\[Source\s+\d+\]/gi, ""));
    if (!value || seen.has(label.toLowerCase())) continue;
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
    const truncated = text.length > 180 ? text.slice(0, 177) + "..." : text;
    bullets.push({ text: truncated, sourceIdx });
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

function extractActionItems(answer: string | undefined, findings: Finding[]): ThesisBullet[] {
  const explicit = extractBulletsWithSources(answer).slice(0, 5);
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
