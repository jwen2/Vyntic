"use client";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CellData } from "@/lib/api";
import { extractNumericData } from "@/lib/numericDetector";
import CitationPopover from "./CitationPopover";

interface Props {
  cell: CellData | undefined;
}

export default function MatrixCell({ cell }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const numericData = useMemo(
    () => (cell?.answer ? extractNumericData(cell.answer) : null),
    [cell?.answer]
  );

  if (!cell) {
    return (
      <td className="p-3 text-gray-400 text-sm border border-gray-200">—</td>
    );
  }

  if (cell.status === "loading") {
    return (
      <td className="p-3 border border-gray-200">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
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

  return (
    <td className="p-3 border border-gray-200 text-sm max-w-xs align-top">
      <CitationPopover citations={cell.citations}>
        <div
          className={`prose prose-sm max-w-none text-gray-800 hover:text-blue-700 transition-colors ${
            expanded ? "" : "line-clamp-4"
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <table className="text-xs border-collapse w-full my-1">
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th className="border border-gray-300 px-2 py-1 bg-gray-50 text-left text-xs font-medium">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-300 px-2 py-1 text-xs">
                  {children}
                </td>
              ),
              p: ({ children }) => (
                <p className="my-0.5 text-sm leading-snug">{children}</p>
              ),
            }}
          >
            {cell.answer}
          </ReactMarkdown>
        </div>
        {cell.citations.length > 0 && (
          <div className="mt-1 text-xs text-blue-500">
            {cell.citations.length} source
            {cell.citations.length > 1 ? "s" : ""}
          </div>
        )}
      </CitationPopover>

      {/* Controls row */}
      <div className="flex items-center gap-2 mt-1">
        {cell.answer.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 hover:text-blue-700"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {numericData && (
          <button
            onClick={() => setShowChart(!showChart)}
            className="text-[10px] text-blue-500 hover:text-blue-700"
            title="Toggle chart"
          >
            {showChart ? "Hide chart" : "View chart"}
          </button>
        )}
      </div>

      {/* Chart */}
      {showChart && numericData && (
        <div className="mt-2 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={numericData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={40}
              />
              <YAxis tick={{ fontSize: 9 }} width={40} />
              <Tooltip
                contentStyle={{ fontSize: 11 }}
                formatter={(value: number) => [value.toFixed(1), "Value"]}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </td>
  );
}
