"use client";
import { useState, useMemo, ReactNode, Children, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { CellData, Citation } from "@/lib/api";
import {
  extractTableSeries,
  seriesToChartData,
  TableSeries,
} from "@/lib/numericDetector";
import CitationPopover from "./CitationPopover";
import InlineCitation from "./InlineCitation";

const SOURCE_RE = /\[Source\s+(\d+)\]/g;

const CHART_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
];

function renderTextWithCitations(
  text: string,
  citations: (Citation | null)[],
  onViewDocument?: (citation: Citation) => void
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(SOURCE_RE);

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const idx = parseInt(match[1], 10);
    parts.push(
      <InlineCitation
        key={`src-${match.index}`}
        index={idx}
        citation={citations[idx - 1]}
        onViewDocument={onViewDocument}
      />
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function processCitations(
  children: ReactNode,
  citations: (Citation | null)[],
  onViewDocument?: (citation: Citation) => void
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      if (SOURCE_RE.test(child)) {
        return <>{renderTextWithCitations(child, citations, onViewDocument)}</>;
      }
      return child;
    }
    return child;
  });
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Detect if a cell value is a delta/change value */
function isDeltaCell(text: string): "positive" | "negative" | null {
  const cleaned = text.replace(/\*+/g, "").trim();
  if (/^\+/.test(cleaned)) return "positive";
  if (/^[-–]/.test(cleaned) && !/^[-–:]+$/.test(cleaned)) return "negative";
  if (/\([-–]/.test(cleaned)) return "negative"; // e.g. ($2.3M)
  return null;
}

/** Detect if a header is a delta column */
function isDeltaHeader(text: string): boolean {
  return /Δ|delta|change/i.test(text);
}

/** Format a tooltip value */
function formatTooltipValue(value: number, isPercentage: boolean): string {
  if (isPercentage) return `${value.toFixed(1)}%`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}B`;
  if (Math.abs(value) >= 1) return `$${value.toFixed(1)}M`;
  return `$${(value * 1000).toFixed(0)}K`;
}

/** Inline chart component for time-series table data */
function TimeSeriesChart({
  series,
  chartType,
}: {
  series: TableSeries[];
  chartType: "bar" | "line" | "area";
}) {
  const chartData = useMemo(() => seriesToChartData(series), [series]);
  if (!chartData) return null;

  const { data, metrics } = chartData;
  const isPercentage = series[0]?.isPercentage ?? false;

  const commonAxisProps = {
    tick: { fontSize: 10, fill: "#6b7280" },
    axisLine: { stroke: "#e5e7eb" },
    tickLine: false,
  };

  const tooltipFormatter = (value: number) => [
    formatTooltipValue(value, isPercentage),
    "",
  ];

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <defs>
            {metrics.map((_, i) => (
              <linearGradient key={i} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="period" {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `$${v}M`} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
            formatter={tooltipFormatter}
          />
          {metrics.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {metrics.map((metric, i) => (
            <Area
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={`url(#gradient-${i})`}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="period" {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `$${v}M`} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
            formatter={tooltipFormatter}
          />
          {metrics.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {metrics.map((metric, i) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Bar chart (default)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="period" {...commonAxisProps} />
        <YAxis {...commonAxisProps} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `$${v}M`} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
          formatter={tooltipFormatter}
          cursor={{ fill: "rgba(59, 130, 246, 0.05)" }}
        />
        {metrics.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {metrics.map((metric, i) => (
          <Bar
            key={metric}
            dataKey={metric}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface Props {
  cell: CellData | undefined;
  synthesis?: boolean;
  dealId?: string;
  onCitationClick?: (citation: Citation, dealId: string) => void;
}

export default function MatrixCell({
  cell,
  synthesis = false,
  dealId,
  onCitationClick,
}: Props) {
  const [expanded, setExpanded] = useState(synthesis);
  const [chartType, setChartType] = useState<"bar" | "line" | "area" | null>(null);

  const cleanAnswer = useMemo(
    () => (cell?.answer ? stripThinkTags(cell.answer) : ""),
    [cell?.answer]
  );

  const tableSeries = useMemo(
    () => (cleanAnswer ? extractTableSeries(cleanAnswer) : []),
    [cleanAnswer]
  );

  const hasChartableData = tableSeries.length > 0;

  const handleViewDocument = useMemo(() => {
    if (!onCitationClick) return undefined;
    if (!dealId && !synthesis) return undefined;
    return (citation: Citation) => {
      const targetDealId = citation.deal_id || dealId;
      if (targetDealId) {
        onCitationClick(citation, targetDealId);
      }
    };
  }, [onCitationClick, dealId, synthesis]);

  const toggleChart = useCallback(
    (type: "bar" | "line" | "area") => {
      setChartType((prev) => (prev === type ? null : type));
    },
    []
  );

  if (!cell) {
    return (
      <td className="p-3 text-gray-400 text-sm border border-gray-200">—</td>
    );
  }

  // Streaming
  if (cell.status === "loading" && cell.answer.length > 0) {
    const streamingText = stripThinkTags(cell.answer);
    if (!streamingText) {
      return (
        <td className={`p-3 border border-gray-200 text-sm align-top ${synthesis ? "min-w-[350px]" : "max-w-xs"}`}>
          <div className="flex items-center gap-2 text-amber-600">
            <div className="animate-pulse text-xs">Reasoning...</div>
          </div>
        </td>
      );
    }
    return (
      <td className={`p-3 border border-gray-200 text-sm align-top ${synthesis ? "min-w-[350px]" : "max-w-xs"}`}>
        <div className={`prose prose-sm max-w-none text-gray-800 ${synthesis ? "" : "line-clamp-6"}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
        </div>
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      </td>
    );
  }

  if (cell.status === "loading") {
    return (
      <td className="p-3 border border-gray-200">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-xs text-gray-400">Analyzing...</span>
        </div>
      </td>
    );
  }

  if (cell.status === "error") {
    return (
      <td className="p-3 border border-gray-200 bg-red-50 text-red-700 text-sm">
        {cell.answer}
      </td>
    );
  }

  const tdClass = synthesis
    ? "p-4 border border-gray-200 text-sm min-w-[350px] align-top"
    : "p-3 border border-gray-200 text-sm max-w-xs align-top";

  const clampClass = synthesis ? "" : expanded ? "" : "line-clamp-4";

  return (
    <td className={tdClass}>
      <CitationPopover citations={cell.citations.filter((c): c is Citation => c !== null)} onViewDocument={handleViewDocument}>
        <div className={`prose prose-sm max-w-none text-gray-800 ${clampClass}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="not-prose overflow-x-auto my-3 rounded-lg border border-gray-200 shadow-sm bg-white">
                  <table className="text-xs border-collapse w-full min-w-[280px]">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gradient-to-b from-slate-50 to-slate-100/80">{children}</thead>
              ),
              th: ({ children }) => {
                const text = typeof children === "string" ? children : String(children ?? "");
                const isDelta = isDeltaHeader(text);
                return (
                  <th
                    className={`border-b border-r border-gray-200 last:border-r-0 px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap tracking-wide ${
                      isDelta
                        ? "text-gray-500 bg-gray-50/50 italic"
                        : "text-gray-700"
                    }`}
                  >
                    {children}
                  </th>
                );
              },
              tr: ({ children }) => (
                <tr className="even:bg-slate-50/40 hover:bg-blue-50/30 transition-colors border-b border-gray-100 last:border-b-0">
                  {children}
                </tr>
              ),
              td: ({ children }) => {
                const text = typeof children === "string" ? children : "";
                const raw = Array.isArray(children)
                  ? children.map((c) => (typeof c === "string" ? c : "")).join("")
                  : text;
                const delta = isDeltaCell(raw);

                return (
                  <td
                    className={`border-r border-gray-100 last:border-r-0 px-3 py-2 text-xs tabular-nums font-medium ${
                      delta === "positive"
                        ? "text-emerald-700 bg-emerald-50/40"
                        : delta === "negative"
                        ? "text-red-700 bg-red-50/40"
                        : "text-gray-700"
                    }`}
                  >
                    {processCitations(children, cell.citations, handleViewDocument)}
                  </td>
                );
              },
              p: ({ children }) => (
                <p className="my-1.5 text-sm leading-relaxed">
                  {processCitations(children, cell.citations, handleViewDocument)}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="my-1.5 ml-4 list-disc space-y-1 text-sm">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-1.5 ml-4 list-decimal space-y-1 text-sm">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-sm leading-relaxed">
                  {processCitations(children, cell.citations, handleViewDocument)}
                </li>
              ),
              h1: ({ children }) => (
                <h3 className="text-base font-bold mt-3 mb-1.5 text-gray-900">{children}</h3>
              ),
              h2: ({ children }) => (
                <h4 className="text-sm font-bold mt-2.5 mb-1 text-gray-900">{children}</h4>
              ),
              h3: ({ children }) => (
                <h5 className="text-sm font-semibold mt-2 mb-1 text-gray-800">{children}</h5>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900">{children}</strong>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-3 border-blue-300 pl-3 my-2 text-sm text-gray-600 italic">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-3 border-gray-200" />,
            }}
          >
            {cleanAnswer}
          </ReactMarkdown>
        </div>
        {cell.citations.length > 0 && (
          <div className="mt-1 text-xs text-blue-500">
            {cell.citations.filter(c => c !== null).length} source{cell.citations.filter(c => c !== null).length > 1 ? "s" : ""}
          </div>
        )}
      </CitationPopover>

      {/* Model analytics */}
      {cell.model && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
          <span className={`px-1.5 py-0.5 rounded-full font-mono ${cell.fallback ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
            {cell.model}
          </span>
          {cell.fallback && <span className="text-amber-600 font-medium">fallback</span>}
          {cell.duration_ms != null && <span>{(cell.duration_ms / 1000).toFixed(1)}s</span>}
        </div>
      )}

      {/* Chart + controls */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {!synthesis && cleanAnswer.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {synthesis && cleanAnswer.length > 500 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-amber-600 hover:text-amber-800 font-medium px-1.5 py-0.5 rounded hover:bg-amber-50 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
        {hasChartableData && (
          <div className="flex items-center gap-0.5 ml-auto">
            <span className="text-[9px] text-gray-400 mr-1">Chart:</span>
            <button
              onClick={() => toggleChart("bar")}
              className={`p-1 rounded transition-colors ${
                chartType === "bar" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              }`}
              title="Bar chart"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1" />
              </svg>
            </button>
            <button
              onClick={() => toggleChart("line")}
              className={`p-1 rounded transition-colors ${
                chartType === "line" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              }`}
              title="Line chart"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </button>
            <button
              onClick={() => toggleChart("area")}
              className={`p-1 rounded transition-colors ${
                chartType === "area" ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              }`}
              title="Area chart"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 19l4-4 4 2 4-6 4 4V19H3z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Inline chart */}
      {chartType && hasChartableData && (
        <div className="mt-2 rounded-lg border border-gray-100 bg-gradient-to-b from-white to-gray-50/50 p-2">
          <div className="h-44 w-full">
            <TimeSeriesChart series={tableSeries} chartType={chartType} />
          </div>
        </div>
      )}
    </td>
  );
}
