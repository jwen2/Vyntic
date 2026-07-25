
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
import Button from "@/components/ui/Button";
import {
  BRIEF_CONFIG,
  DIFF_KEY_PREFIX,
  INVESTMENT_THESIS_LABEL,
  NEXT_ACTIONS_LABEL,
  OVERRIDE_KEY_PREFIX,
  type BriefEntityConfig,
  type BriefField,
  type BriefWorkstreamShim,
  type ChartSeries,
  type FinancialTable,
  type FinancialView,
  type Metric,
  type OverrideStore,
  type QuestionResult,
  type ThesisBullet,
  type ThesisSections,
} from "./brief/config";
import {
  buildChartSeries,
  deriveActions,
  extractBullets,
  extractBulletsWithSources,
  extractFinancialTables,
  extractMetrics,
  extractThesisSections,
  pairsToFields,
} from "./brief/parse";
import {
  diffPanel,
  formatRelativeTime,
  mergeOverrides,
  type BriefDiffSnapshot,
  type FieldDiff,
} from "./brief/diff";
import {
  compareFindingSeverity,
  countSources,
  isGapFinding,
  isInconsistencyFinding,
  resultByLabel,
} from "./brief/findings";
import { useProactiveScanRun } from "./brief/useProactiveScanRun";
import { useBriefOverrides } from "./brief/useBriefOverrides";
import { useBriefDiff } from "./brief/useBriefDiff";








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














function lineClamp(lineCount: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lineCount,
    overflow: "hidden",
  };
}










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

  const { overrides, setOverride } = useBriefOverrides(dealId);

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

  const {
    diff,
    diffOpen,
    setDiffOpen,
    rerunning,
    handleRerun,
    dismissDiff,
  } = useBriefDiff({
    dealId,
    brief,
    scanWorkstream,
    scanResults,
    overrides,
    snapshotFields,
    transactionFields,
    lastScanAt,
    refreshing,
    hasAnyCompleted,
    isLoading,
    kickOffRun,
  });

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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRerun}
                  disabled={refreshing}
                  loading={rerunning}
                  title="Re-run the deal brief"
                >
                  {rerunning ? "Re-running…" : "Refresh scan"}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={onOpenProactiveScan}>
                {scanStarted ? "Run again" : `Run ${brief.runLabel.toLowerCase()}`}
              </Button>
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
              border: "1px solid var(--danger-tint-border)",
              background: "var(--danger-tint)",
              color: "var(--danger)",
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
        border: `1px solid ${isAlert ? "var(--status-critical-tint-border)" : c.border}`,
        background: isAlert ? "var(--status-critical-tint)" : c.surfaceAlt,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isAlert ? "var(--status-critical)" : c.t3,
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

        <Button variant="primary" onClick={onOpenProactiveScan}>
          Run {config.runLabel.toLowerCase()}
        </Button>
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
                  <div style={{ width: "100%", minHeight: 3, height: `${Math.max(4, (Math.abs(point.value) / max) * 38)}px`, borderRadius: "3px 3px 0 0", background: point.value < 0 ? "var(--status-critical)" : ACCENT }} />
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
        <Button variant="subtle" size="xs" onClick={onClose}>
          Hide
        </Button>
        <Button variant="subtle" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
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
  const tone = change.kind === "added" ? "var(--status-good)" : change.kind === "removed" ? "var(--status-critical)" : "var(--status-warning)";
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





























