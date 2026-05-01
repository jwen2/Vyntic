"use client";
import { useState, useMemo, ReactNode, Children, useCallback, isValidElement, cloneElement } from "react";
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
import { fixMarkdownTables } from "@/lib/markdownUtils";

const SOURCE_PATTERN = /\[Source\s+(\d+)\]/g;

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
  const re = new RegExp(SOURCE_PATTERN);

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
      if (new RegExp(SOURCE_PATTERN).test(child)) {
        return <>{renderTextWithCitations(child, citations, onViewDocument)}</>;
      }
      return child;
    }
    if (
      isValidElement(child) &&
      child.props &&
      (child.props as Record<string, unknown>).children
    ) {
      const nested = (child.props as Record<string, unknown>)
        .children as ReactNode;
      const processed = processCitations(nested, citations, onViewDocument);
      return cloneElement(child, {}, processed);
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
    tick: { fontSize: 10, fill: "#9ca3af" },
    axisLine: { stroke: "#374151" },
    tickLine: false,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any) => [
    formatTooltipValue(Number(value), isPercentage),
    "",
  ];

  const tooltipStyle = {
    fontSize: 11,
    borderRadius: 8,
    border: "1px solid #374151",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3)",
    backgroundColor: "#1f2937",
    color: "#e5e7eb",
  };

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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="period" {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `$${v}M`} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
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
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="period" {...commonAxisProps} />
          <YAxis {...commonAxisProps} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `$${v}M`} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis dataKey="period" {...commonAxisProps} />
        <YAxis {...commonAxisProps} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `$${v}M`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={tooltipFormatter}
          cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
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
  query?: string;
  onCitationClick?: (citation: Citation, dealId: string) => void;
  onInvestigate?: (dealId: string, goal: string) => void;
}

export default function MatrixCell({
  cell,
  synthesis = false,
  dealId,
  query,
  onCitationClick,
  onInvestigate,
}: Props) {
  const agenticEnabled = process.env.NEXT_PUBLIC_AGENTIC !== "0";
  const [expanded, setExpanded] = useState(synthesis);
  const [chartType, setChartType] = useState<"bar" | "line" | "area" | null>(null);

  const cleanAnswer = useMemo(
    () => (cell?.answer ? fixMarkdownTables(stripThinkTags(cell.answer)) : ""),
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
      <td className="p-3 text-gray-400 dark:text-gray-600 text-sm border border-gray-200 dark:border-gray-700">—</td>
    );
  }

  // Streaming
  if (cell.status === "loading" && cell.answer.length > 0) {
    const streamingText = stripThinkTags(cell.answer);
    if (!streamingText) {
      return (
        <td className={`p-3 border border-gray-200 dark:border-gray-700 text-sm align-top ${synthesis ? "min-w-[350px]" : "max-w-xs"}`}>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <div className="animate-pulse text-xs">Reasoning...</div>
          </div>
        </td>
      );
    }
    return (
      <td className={`p-3 border border-gray-200 dark:border-gray-700 text-sm align-top ${synthesis ? "min-w-[350px]" : "max-w-xs"}`}>
        <div className={`prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 ${synthesis ? "" : "line-clamp-6"}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
        </div>
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      </td>
    );
  }

  if (cell.status === "loading") {
    return (
      <td className="p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-xs text-gray-400 dark:text-gray-500">Analyzing...</span>
        </div>
      </td>
    );
  }

  if (cell.status === "error") {
    return (
      <td className="p-3 border border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm">
        {cell.answer}
      </td>
    );
  }

  const tdClass = synthesis
    ? "p-4 border border-gray-200 dark:border-gray-700 text-sm min-w-[350px] align-top"
    : "p-3 border border-gray-200 dark:border-gray-700 text-sm max-w-xs align-top";

  const clampClass = synthesis ? "" : expanded ? "" : "line-clamp-4";

  return (
    <td className={tdClass}>
      <CitationPopover citations={cell.citations.filter((c): c is Citation => c !== null)} onViewDocument={handleViewDocument}>
        <div className={`prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 ${clampClass}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="not-prose overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
                  <table className="text-xs border-collapse w-full min-w-[280px]">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-gray-800 dark:to-gray-800/80">{children}</thead>
              ),
              th: ({ children }) => {
                const text = typeof children === "string" ? children : String(children ?? "");
                const isDelta = isDeltaHeader(text);
                return (
                  <th
                    className={`border-b border-r border-gray-200 dark:border-gray-700 last:border-r-0 px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap tracking-wide ${
                      isDelta
                        ? "text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/50 italic"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {children}
                  </th>
                );
              },
              tr: ({ children }) => (
                <tr className="even:bg-slate-50/40 dark:even:bg-gray-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0">
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
                    className={`border-r border-gray-100 dark:border-gray-800 last:border-r-0 px-3 py-2 text-xs tabular-nums font-medium ${
                      delta === "positive"
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20"
                        : delta === "negative"
                        ? "text-red-700 dark:text-red-400 bg-red-50/40 dark:bg-red-950/20"
                        : "text-gray-700 dark:text-gray-300"
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
                <h3 className="text-base font-bold mt-3 mb-1.5 text-gray-900 dark:text-gray-100">{children}</h3>
              ),
              h2: ({ children }) => (
                <h4 className="text-sm font-bold mt-2.5 mb-1 text-gray-900 dark:text-gray-100">{children}</h4>
              ),
              h3: ({ children }) => (
                <h5 className="text-sm font-semibold mt-2 mb-1 text-gray-800 dark:text-gray-200">{children}</h5>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-3 border-blue-300 dark:border-blue-600 pl-3 my-2 text-sm text-gray-600 dark:text-gray-400 italic">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
            }}
          >
            {cleanAnswer}
          </ReactMarkdown>
        </div>
      </CitationPopover>

      {/* Model analytics */}
      {cell.model && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
          <span className={`px-1.5 py-0.5 rounded-full font-mono ${cell.fallback ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
            {cell.model}
          </span>
          {cell.fallback && <span className="text-amber-600 dark:text-amber-400 font-medium">fallback</span>}
          {cell.duration_ms != null && <span>{(cell.duration_ms / 1000).toFixed(1)}s</span>}
        </div>
      )}

      {/* Chart + controls */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {agenticEnabled && onInvestigate && !synthesis && dealId && query && (
          <button
            onClick={() => onInvestigate(dealId, query)}
            className="text-[10px] text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 px-1.5 py-0.5 rounded hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
            title="Investigate further with the diligence agent"
          >
            Investigate further
          </button>
        )}
        {!synthesis && cleanAnswer.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {synthesis && cleanAnswer.length > 500 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-medium px-1.5 py-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
        {hasChartableData && (
          <div className="flex items-center gap-0.5 ml-auto">
            <span className="text-[9px] text-gray-400 dark:text-gray-500 mr-1">Chart:</span>
            <button
              onClick={() => toggleChart("bar")}
              className={`p-1 rounded transition-colors ${
                chartType === "bar" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
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
                chartType === "line" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
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
                chartType === "area" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
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
        <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gradient-to-b from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900/50 p-2">
          <div className="h-44 w-full">
            <TimeSeriesChart series={tableSeries} chartType={chartType} />
          </div>
        </div>
      )}
    </td>
  );
}
