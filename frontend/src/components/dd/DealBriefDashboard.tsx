
import { useCallback, useEffect, useMemo } from "react";
import type { Citation } from "@/lib/api";
import type { Finding } from "./types";
import {
  BRIEF_CONFIG,
  INVESTMENT_THESIS_LABEL,
  NEXT_ACTIONS_LABEL,
} from "./brief/config";
import {
  deriveActions,
  extractFinancialTables,
  extractMetrics,
  extractThesisSections,
  pairsToFields,
} from "./brief/parse";
import { mergeOverrides } from "./brief/diff";
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
import ActionsPanel from "./brief/ActionsPanel";
import BriefHeader from "./brief/BriefHeader";
import BriefPanel from "./brief/BriefPanel";
import DiffPanel from "./brief/DiffPanel";
import EmptyBrief from "./brief/EmptyBrief";
import FinancialPanel from "./brief/FinancialPanel";
import FindingsPanel from "./brief/FindingsPanel";
import ThesisPanel from "./brief/ThesisPanel";








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
























export default function DealBriefDashboard({
  dealId,
  theme,
  entityType = "deal",
  onCit,
  onFindingsExtracted,
}: Props) {
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
        <BriefHeader
          theme={theme}
          brief={brief}
          completed={completed}
          total={total}
          isLoading={isLoading}
          rerunning={rerunning}
          refreshing={refreshing}
          scanStarted={scanStarted}
          lastScanAt={lastScanAt}
          diff={diff}
          diffOpen={diffOpen}
          setDiffOpen={setDiffOpen}
          sourceCount={sourceCount}
          dealBreakerCount={dealBreakerCount}
          materialCount={materialCount}
          inconsistencyCount={inconsistencyCount}
          onRerun={handleRerun}
          onOpenProactiveScan={onOpenProactiveScan}
        />

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




























































