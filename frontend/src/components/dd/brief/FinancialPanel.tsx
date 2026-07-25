// Financial highlights: tabbed chart / table / metrics views.
// Extracted from DealBriefDashboard.tsx (FE5.4).

import { useEffect, useMemo, useState } from "react";
import { ACCENT, ddTheme } from "../types";
import { type ChartSeries, type FinancialTable, type FinancialView, type Metric } from "./config";
import { buildChartSeries, extractBullets } from "./parse";
import { Placeholder } from "./parts";

export function FinancialPanel({
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

export function SegmentedTabs({
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

export function FinancialChart({ series, theme }: { series: ChartSeries[]; theme: "light" | "dark" }) {
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

export function FinancialTableView({ table, theme }: { table: FinancialTable; theme: "light" | "dark" }) {
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

export function MetricsTable({ metrics, theme }: { metrics: Metric[]; theme: "light" | "dark" }) {
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

export function SimpleFinancialTable({ items, theme }: { items: string[]; theme: "light" | "dark" }) {
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

export default FinancialPanel;
