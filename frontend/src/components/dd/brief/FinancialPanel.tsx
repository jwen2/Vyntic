// Financial highlights: tabbed chart / table / metrics views.
// Extracted from DealBriefDashboard.tsx (FE5.4).

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import { ACCENT } from "../types";
import { type ChartSeries, type FinancialTable, type FinancialView, type Metric } from "./config";
import { buildChartSeries, extractBullets } from "./parse";
import { Placeholder } from "./parts";

export function FinancialPanel({
  metrics,
  tables,
  fallback,
  primaryTabLabel = "Annual",
  panelTitle,
}: {
  metrics: Metric[];
  tables: FinancialTable[];
  fallback?: string;
  primaryTabLabel?: string;
  panelTitle?: string;
}) {
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
    <Card level="panel">
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div
          className="font-mono-plex text-t3"
          style={{
            fontSize: 10,
            fontWeight: 700,
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
        />
      </div>

      {activeTable ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chartSeries.length > 0 && <FinancialChart series={chartSeries} />}
          <FinancialTableView table={activeTable} />
        </div>
      ) : metrics.length > 0 ? (
        <MetricsTable metrics={metrics} />
      ) : fallbackItems.length > 0 ? (
        <SimpleFinancialTable items={fallbackItems} />
      ) : !hasStructuredData ? (
        <Placeholder text="No financial metrics extracted yet" />
      ) : null}
    </Card>
  );
}

export function SegmentedTabs({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: FinancialView; label: string; disabled: boolean }>;
  value: FinancialView;
  onChange: (view: FinancialView) => void;
}) {
  return (
    <div className="flex items-center border border-edge bg-surface-alt" style={{ gap: 2, padding: 3, borderRadius: 999 }}>
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
              color: option.disabled ? "var(--text-4)" : active ? "var(--on-accent)" : "var(--text-2)",
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

export function FinancialChart({ series }: { series: ChartSeries[] }) {
  const max = Math.max(...series.flatMap((item) => item.values.map((point) => Math.abs(point.value))), 1);
  return (
    <Card level="inner" tone="alt">
      <div className="text-t3" style={{ fontSize: 10, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trend chart</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {series.slice(0, 3).map((item) => (
          <div key={item.label} style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: 8, alignItems: "center" }}>
            <div className="text-t2" style={{ fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${item.values.length}, minmax(22px, 1fr))`, gap: 4, alignItems: "end", height: 44 }}>
              {item.values.map((point) => (
                <div key={`${item.label}-${point.period}`} title={`${item.label} ${point.period}: ${point.display}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, minWidth: 0 }}>
                  <div style={{ width: "100%", minHeight: 3, height: `${Math.max(4, (Math.abs(point.value) / max) * 38)}px`, borderRadius: "3px 3px 0 0", background: point.value < 0 ? "var(--status-critical)" : ACCENT }} />
                  <div className="text-t3" style={{ fontSize: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{point.period}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function FinancialTableView({ table }: { table: FinancialTable }) {
  return (
    <Card level="inner" padding={0} className="overflow-hidden">
      <div className="border-b border-edge bg-grid-header text-t1" style={{ padding: "9px 12px", fontSize: 11, fontWeight: 700 }}>
        {table.title}
      </div>
      <div className="data-table-wrap">
        <table className="data-table data-table--dense" style={{ minWidth: 420 }}>
          <thead>
            <tr>
              {table.headers.map((header, idx) => (
                <th
                  key={`${table.title}-h-${idx}`}
                  className={idx === 0 ? undefined : "data-table__num"}
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
                    className={[
                      cIdx > 0 ? "data-table__num data-table__muted" : "data-table__strong",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {row[cIdx] || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function MetricsTable({ metrics }: { metrics: Metric[] }) {
  return (
    <Card level="inner" padding={0} className="overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            {["Metric", "Value", "Context"].map((header, idx) => (
              <th key={header} className={idx === 1 ? "data-table__num" : undefined}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.slice(0, 8).map((metric, idx) => (
            <tr key={`${metric.label}-${idx}`}>
              <td className="data-table__strong">{metric.label}</td>
              <td className="data-table__num">{metric.value}</td>
              <td className="data-table__muted">{metric.context}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function SimpleFinancialTable({ items }: { items: string[] }) {
  return (
    <Card level="inner" padding={0} className="overflow-hidden">
      <table className="data-table">
        <tbody>
          {items.map((item, idx) => {
            const [label, ...rest] = item.split(":");
            return (
              <tr key={`${item}-${idx}`}>
                <td className="data-table__strong" style={{ width: "34%" }}>{rest.length ? label : `Item ${idx + 1}`}</td>
                <td className="data-table__muted">{rest.length ? rest.join(":").trim() : item}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export default FinancialPanel;
