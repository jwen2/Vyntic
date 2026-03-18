"use client";
import { useState, useMemo, ReactNode } from "react";
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
import { CellData, Citation } from "@/lib/api";
import { extractNumericData } from "@/lib/numericDetector";
import CitationPopover from "./CitationPopover";
import InlineCitation from "./InlineCitation";

const SOURCE_RE = /\[Source\s+(\d+)\]/g;

function renderTextWithCitations(
  text: string,
  citations: Citation[],
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

/**
 * Strip DeepSeek-R1 <think>…</think> reasoning blocks so only the
 * final answer is displayed.  Handles multiline content.
 */
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

interface Props {
  cell: CellData | undefined;
  /** Render in synthesis (wide / expanded) mode */
  synthesis?: boolean;
  /** Deal ID this cell belongs to (needed for document viewer) */
  dealId?: string;
  /** Callback when a citation is clicked to open the document viewer */
  onCitationClick?: (citation: Citation, dealId: string) => void;
}

export default function MatrixCell({ cell, synthesis = false, dealId, onCitationClick }: Props) {
  const [expanded, setExpanded] = useState(synthesis); // synthesis starts expanded
  const [showChart, setShowChart] = useState(false);

  const cleanAnswer = useMemo(
    () => (cell?.answer ? stripThinkTags(cell.answer) : ""),
    [cell?.answer]
  );

  const numericData = useMemo(
    () => (cleanAnswer ? extractNumericData(cleanAnswer) : null),
    [cleanAnswer]
  );

  const handleViewDocument = useMemo(() => {
    if (!onCitationClick || !dealId) return undefined;
    return (citation: Citation) => {
      onCitationClick(citation, dealId);
    };
  }, [onCitationClick, dealId]);

  if (!cell) {
    return (
      <td className="p-3 text-gray-400 text-sm border border-gray-200">—</td>
    );
  }

  // Streaming: show partial text with blinking cursor
  if (cell.status === "loading" && cell.answer.length > 0) {
    const streamingText = stripThinkTags(cell.answer);
    // If only <think> content so far, show a thinking indicator
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {streamingText}
          </ReactMarkdown>
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

  const clampClass = synthesis
    ? "" // synthesis always starts expanded
    : expanded
    ? ""
    : "line-clamp-4";

  return (
    <td className={tdClass}>
      <CitationPopover citations={cell.citations} onViewDocument={handleViewDocument}>
        <div
          className={`prose prose-sm max-w-none text-gray-800 hover:text-blue-700 transition-colors ${clampClass}`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <table className="text-xs border-collapse w-full my-2">
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
                <p className="my-1 text-sm leading-relaxed">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="my-1 ml-4 list-disc space-y-0.5 text-sm">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-1 ml-4 list-decimal space-y-0.5 text-sm">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-sm leading-snug">{children}</li>
              ),
              h1: ({ children }) => (
                <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>
              ),
              h2: ({ children }) => (
                <h4 className="text-sm font-bold mt-2 mb-1">{children}</h4>
              ),
              h3: ({ children }) => (
                <h5 className="text-sm font-semibold mt-1.5 mb-0.5">{children}</h5>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900">{children}</strong>
              ),
              text: ({ children }) => {
                if (typeof children !== "string") return <>{children}</>;
                if (!SOURCE_RE.test(children)) return <>{children}</>;
                return <>{renderTextWithCitations(children, cell.citations, handleViewDocument)}</>;
              },
            }}
          >
            {cleanAnswer}
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
        {!synthesis && cleanAnswer.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-500 hover:text-blue-700"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {synthesis && cleanAnswer.length > 500 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-amber-600 hover:text-amber-800 font-medium"
          >
            {expanded ? "Collapse synthesis" : "Expand synthesis"}
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
                formatter={(value) => [Number(value).toFixed(1), "Value"]}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </td>
  );
}
