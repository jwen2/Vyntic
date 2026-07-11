import { ddTheme } from "@/components/dd/types";
import type { Workflow, WorkflowRun } from "@/lib/workflows";
import ConfirmDialog from "@/components/ConfirmDialog";
import DocumentViewer from "@/components/DocumentViewer";
import { ACCENT } from "./theme";
import CompareView from "./CompareView";
import { useTabularRun, type Theme } from "./tabular-run/useTabularRun";
import { SummaryCards } from "./tabular-run/parts";
import RunToolbar from "./tabular-run/RunToolbar";
import RunSidebar from "./tabular-run/RunSidebar";
import RunTable from "./tabular-run/RunTable";
import RunDetailPanel from "./tabular-run/RunDetailPanel";

interface TabularRunProps {
  dealId: string;
  runId: string;
  workflow: Workflow;
  theme: Theme;
  onBack: () => void;
  /** Called once when run reaches a terminal state (complete/error/cancelled). */
  onComplete?: (run: WorkflowRun) => void;
  /** Bubbled up so the parent's workflow list can refresh after a column edit. */
  onWorkflowChange?: (workflow: Workflow) => void;
}

export default function TabularRun({
  dealId,
  runId,
  workflow: workflowProp,
  theme,
  onBack,
  onComplete,
  onWorkflowChange,
}: TabularRunProps) {
  const c = ddTheme(theme);
  const m = useTabularRun({ dealId, runId, workflow: workflowProp, onComplete, onWorkflowChange });

  if (m.error && !m.run) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: c.bg,
          color: c.t1,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>Couldn't load run</div>
        <div style={{ fontSize: 12, color: c.t2, textAlign: "center", maxWidth: 480 }}>{m.error}</div>
        <button
          onClick={onBack}
          style={{
            padding: "6px 12px",
            background: ACCENT,
            color: "var(--on-accent)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Back to library
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        background: c.bg,
        color: c.t1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <RunToolbar
        workflow={m.workflow}
        run={m.run}
        theme={theme}
        view={m.view}
        onView={m.setView}
        documentCount={m.documentIds.length}
        columnCount={m.runColumns.length}
        completeCells={m.completeCells}
        totalCells={m.totalCells}
        elapsedLabel={m.elapsedLabel}
        isTerminal={m.isTerminal}
        cancelling={m.cancelling}
        exporting={m.exporting}
        onBack={onBack}
        onCancel={m.handleCancel}
        onExport={m.handleExport}
      />

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr) 340px",
          minHeight: 0,
        }}
      >
        <RunSidebar
          theme={theme}
          documentIds={m.documentIds}
          docs={m.docs}
          runColumns={m.runColumns}
          cells={m.cells}
          log={m.log}
        />

        {/* Center: summary + grid/compare */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            <SummaryCards
              theme={theme}
              documents={m.documentIds.length}
              completeCells={m.completeCells}
              totalCells={m.totalCells}
              highRiskCount={m.highRiskCount}
              elapsedLabel={m.elapsedLabel}
              runId={m.run?.id ?? runId}
            />
            {m.view === "compare" ? (
              <CompareView
                workflowId={m.workflow.id}
                columns={m.runColumns}
                rowKeys={m.rowKeys}
                cells={m.cells}
                docs={m.docs}
                rowSourceIsDoc={m.workflow.row_source === "one_doc_per_row"}
                theme={theme}
                onCitationClick={m.handleCitationClick}
              />
            ) : (
              <RunTable
                workflow={m.workflow}
                runColumns={m.runColumns}
                rowKeys={m.rowKeys}
                cells={m.cells}
                docs={m.docs}
                theme={theme}
                density={m.density}
                COL_DOC={m.COL_DOC}
                COL_DEFAULT={m.COL_DEFAULT}
                getColWidth={m.getColWidth}
                resizingKey={m.resizingKey}
                onColResize={m.startColResize}
                selectedCellKey={m.selectedCellKey}
                onSelectKey={m.setSelectedCellKey}
                retryingCellIds={m.retryingCellIds}
                onRetryCell={m.handleRetryCell}
                onCitationClick={m.handleCitationClick}
                onSaveColumn={m.handleSaveColumn}
                onColumnPromptChanged={(columnId, label) =>
                  m.setPendingColumnRetry({ columnId, label })
                }
              />
            )}
          </div>
        </div>

        <RunDetailPanel
          theme={theme}
          run={m.run}
          runHistory={m.runHistory}
          selectedCell={m.selectedCell}
          selectedColumn={m.selectedColumn}
          selectedRowLabel={m.selectedRowLabel}
          activeCitId={m.activeCitId}
          onCitationClick={m.handleCitationClick}
          onRetryCell={m.handleRetryCell}
          retrying={m.selectedCell ? m.retryingCellIds.has(m.selectedCell.id) : false}
        />
      </div>

      {m.viewerState && (
        <DocumentViewer
          dealId={m.viewerState.dealId}
          filename={m.viewerState.filename}
          page={m.viewerState.page}
          snippet={m.viewerState.snippet}
          onClose={() => m.setViewerState(null)}
        />
      )}

      {m.pendingColumnRetry && (
        <ConfirmDialog
          title="Re-run with updated prompt?"
          message={`This will discard existing answers for "${m.pendingColumnRetry.label}" and re-run the updated prompt against ${m.rowKeys.length} ${m.rowKeys.length === 1 ? "row" : "rows"}.`}
          confirmLabel="Re-run"
          cancelLabel="Keep existing"
          onConfirm={() => {
            const { columnId } = m.pendingColumnRetry!;
            m.setPendingColumnRetry(null);
            void m.handleRetryColumn(columnId);
          }}
          onCancel={() => m.setPendingColumnRetry(null)}
        />
      )}
    </div>
  );
}
