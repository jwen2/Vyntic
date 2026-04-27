"use client";

import { useEffect, useMemo, useState } from "react";
import type { Workstream } from "@/lib/queryTemplates";
import type { QuestionResult } from "@/components/WorkstreamPanel";
import type { Finding, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme } from "./types";

type WorkstreamCache = Record<string, Record<string, QuestionResult>>;

interface Props {
  workstreams: Workstream[];
  resultCache: WorkstreamCache;
  findings: Finding[];
  theme: "light" | "dark";
  onOpenProactiveScan: () => void;
  onSelectFinding: (finding: Finding) => void;
}

interface BriefField {
  label: string;
  value: string;
}

interface Metric {
  label: string;
  value: string;
  context: string;
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
  workstreams,
  resultCache,
  findings,
  theme,
  onOpenProactiveScan,
  onSelectFinding,
}: Props) {
  const c = ddTheme(theme);
  const scanWorkstream = workstreams.find((w) => w.id === "proactive_scan");
  const scanResults = resultCache.proactive_scan || {};
  const scanTemplates = scanWorkstream?.templates || [];
  const completed = scanTemplates.filter((template) => scanResults[template.query]?.status === "complete").length;
  const total = scanTemplates.length;
  const scanStarted = Object.values(scanResults).some((result) => result.status !== "pending");
  const isLoading = Object.values(scanResults).some((result) => result.status === "loading");

  const snapshotResult = resultByLabel(scanWorkstream, scanResults, DEAL_SNAPSHOT_LABEL);
  const transactionResult = resultByLabel(scanWorkstream, scanResults, PROPOSED_TRANSACTION_LABEL);
  const financialResult = resultByLabel(scanWorkstream, scanResults, FINANCIAL_HIGHLIGHTS_LABEL);
  const nextActionsResult = resultByLabel(scanWorkstream, scanResults, NEXT_ACTIONS_LABEL);

  const snapshotFields = extractFields(snapshotResult?.answer, SNAPSHOT_FIELDS);
  const transactionFields = extractFields(transactionResult?.answer, TRANSACTION_FIELDS);
  const metrics = extractMetrics(financialResult?.answer);
  const financialTables = extractFinancialTables(financialResult?.answer);
  const nextActions = extractActionItems(nextActionsResult?.answer, findings);
  const topFindings = findings.slice().sort(compareFindingSeverity).slice(0, 4);
  const gapCount = findings.filter(isGapFinding).length;
  const inconsistencyCount = findings.filter(isInconsistencyFinding).length;
  const sourceCount = countSources([snapshotResult, transactionResult, financialResult, nextActionsResult]);

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
          <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: c.t1 }}>Deal Brief</span>
            <StatusPill completed={completed} total={total} loading={isLoading} theme={theme} />
          </div>
          <div style={{ fontSize: 12, color: c.t2 }}>
            Snapshot, proposed transaction, financial highlights, findings, and next diligence actions
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
          {sourceCount > 0 && <SourcePill count={sourceCount} theme={theme} />}
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

      <div style={{ padding: 18 }}>
        {!scanStarted ? (
          <EmptyBrief theme={theme} onOpenProactiveScan={onOpenProactiveScan} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
              <BriefPanel title="What Is The Deal?" fields={snapshotFields} fallback={snapshotResult?.answer} theme={theme} />
              <BriefPanel title="What Is Being Proposed?" fields={transactionFields} fallback={transactionResult?.answer} theme={theme} />
              <FinancialPanel metrics={metrics} tables={financialTables} fallback={financialResult?.answer} theme={theme} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <FindingsPanel
                findings={topFindings}
                gapCount={gapCount}
                inconsistencyCount={inconsistencyCount}
                theme={theme}
                onSelectFinding={onSelectFinding}
              />
              <ActionsPanel actions={nextActions} theme={theme} />
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
  fields,
  fallback,
  theme,
}: {
  title: string;
  fields: BriefField[];
  fallback?: string;
  theme: "light" | "dark";
}) {
  const c = ddTheme(theme);
  const fallbackItems = fields.length === 0 ? extractBullets(fallback).slice(0, 4) : [];

  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc", minHeight: 168 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: c.t1, marginBottom: 10 }}>{title}</div>
      {fields.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {fields.slice(0, 6).map((field) => (
            <div key={`${title}-${field.label}`} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase" }}>{field.label}</div>
              <div style={{ fontSize: 12, color: c.t1, lineHeight: 1.35, overflowWrap: "anywhere" }}>{field.value}</div>
            </div>
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
  const [view, setView] = useState<FinancialView>(annualTable ? "annual" : quarterlyTable ? "quarterly" : "metrics");
  const activeTable = view === "quarterly" ? quarterlyTable : view === "annual" ? annualTable : null;
  const chartSeries = useMemo(() => (activeTable ? buildChartSeries(activeTable) : []), [activeTable]);
  const hasStructuredData = Boolean(activeTable) || metrics.length > 0 || fallbackItems.length > 0;

  useEffect(() => {
    if (view === "annual" && !annualTable) setView(quarterlyTable ? "quarterly" : "metrics");
    if (view === "quarterly" && !quarterlyTable) setView(annualTable ? "annual" : "metrics");
    if (view === "metrics" && metrics.length === 0 && fallbackItems.length === 0 && annualTable) setView("annual");
  }, [annualTable, fallbackItems.length, metrics.length, quarterlyTable, view]);

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
          onChange={setView}
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
              <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, marginTop: 7 }}>Open analysis</div>
            </button>
          ))}
        </div>
      ) : (
        <Placeholder text="Scan findings will appear here" theme={theme} />
      )}
    </div>
  );
}

function ActionsPanel({ actions, theme }: { actions: string[]; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${c.borderLight}`, background: theme === "dark" ? "#0f172a" : "#f8fafc" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: c.t1, marginBottom: 10 }}>Analyst Next Actions</div>
      {actions.length > 0 ? (
        <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
          {actions.slice(0, 5).map((action, idx) => (
            <li key={`${action}-${idx}`} className="flex" style={{ gap: 8, alignItems: "flex-start" }}>
              <span className="font-mono-dm" style={{ width: 18, height: 18, borderRadius: "50%", background: theme === "dark" ? "#1e293b" : "#e2e8f0", color: c.t2, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {idx + 1}
              </span>
              <span style={{ fontSize: 12, color: c.t1, lineHeight: 1.4 }}>{action}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Placeholder text="Next actions will be generated from the scan" theme={theme} />
      )}
    </div>
  );
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
  const text = cleanText(answer);
  if (!text) return [];
  const normalizedText = text.replace(
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
    const value = normalizeValue(match[1]);
    if (!value || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    fields.push({ label, value });
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

function extractActionItems(answer: string | undefined, findings: Finding[]): string[] {
  const explicit = extractBullets(answer).slice(0, 5);
  if (explicit.length > 0) return explicit;

  const actions: string[] = [];
  if (findings.some((finding) => finding.sev === "deal-breaker")) {
    actions.push("Validate deal-breaker findings against source documents and size the potential downside.");
  }
  if (findings.some((finding) => finding.sev === "material")) {
    actions.push("Build mitigation asks for material findings before the next deal team discussion.");
  }
  if (findings.some(isGapFinding)) {
    actions.push("Request missing VDR materials and unresolved disclosures flagged by the scan.");
  }
  if (findings.some(isInconsistencyFinding)) {
    actions.push("Reconcile conflicting metrics across the CIM, financials, QoE, and model.");
  }
  if (actions.length === 0 && findings.length > 0) {
    actions.push("Review scan findings and route each item to the relevant diligence workstream.");
  }
  return actions;
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
