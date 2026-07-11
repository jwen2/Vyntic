import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const SPREADSHEET_FILE_RE = /\.(xlsx|xls|csv)$/i;
const MARKDOWN_TABLE_RE = /^\s*\|.*\|\s*$/m;

const PERIOD_CELL_RE = /^(?:FY)?\d{4}[EA]?$/i;

type SpreadsheetSnippet = {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
};

type Props = {
  sourceFile: string;
  text?: string;
  variant?: "panel" | "viewer";
};

function isPeriodCell(value: string) {
  return PERIOD_CELL_RE.test(value) || /^Q[1-4]\s?\d{2,4}$/i.test(value);
}

function formatCell(value: string) {
  const trimmed = value.trim();
  const numeric = Number(trimmed.replace(/[$,%]/g, ""));
  if (!trimmed || Number.isNaN(numeric) || !/^-?\$?[\d,]+(?:\.\d+)?%?$/.test(trimmed)) {
    return trimmed;
  }

  const prefix = trimmed.startsWith("$") ? "$" : "";
  const suffix = trimmed.endsWith("%") ? "%" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(numeric)}${suffix}`;
}

function parseSpreadsheetSnippet(text: string | undefined): SpreadsheetSnippet | null {
  const raw = text?.trim();
  if (!raw || !raw.includes("|")) return null;

  const heading = raw.match(/^#{1,6}\s*([^|]+?)(?=\s*\||$)/)?.[1]?.trim();
  const cells = raw
    .replace(/^#{1,6}\s*/, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .filter((cell) => !/^:?-{3,}:?$/.test(cell));

  if (heading && cells[0]?.toLowerCase() === heading.toLowerCase()) {
    cells.shift();
  }

  const firstPeriodIndex = cells.findIndex(isPeriodCell);
  if (firstPeriodIndex === -1) return null;

  const headers: string[] = [];
  for (let i = firstPeriodIndex; i < cells.length && isPeriodCell(cells[i]); i += 1) {
    headers.push(cells[i]);
  }
  if (headers.length < 2) return null;

  const leadCells = cells.slice(0, firstPeriodIndex);
  const dataCells = cells.slice(firstPeriodIndex + headers.length);
  const rowWidth = headers.length + 1;
  const rows: string[][] = [];

  for (let i = 0; i < dataCells.length && rows.length < 6; i += rowWidth) {
    const row = dataCells.slice(i, i + rowWidth);
    if (row.length >= 2) {
      rows.push([...row, ...Array(Math.max(0, rowWidth - row.length)).fill("")]);
    }
  }

  if (!rows.length) return null;

  return {
    title: heading || leadCells[0] || "Spreadsheet excerpt",
    subtitle: heading && leadCells.length ? leadCells.join(" / ") : undefined,
    headers,
    rows,
  };
}

export default function CitationSnippet({ sourceFile, text, variant = "panel" }: Props) {
  const fallback = text || "(No snippet text was returned for this citation.)";
  const parsed = SPREADSHEET_FILE_RE.test(sourceFile) ? parseSpreadsheetSnippet(text) : null;

  if (!parsed) {
    const isViewer = variant === "viewer";
    if (text && MARKDOWN_TABLE_RE.test(text)) {
      return <MarkdownSnippet text={text} isViewer={isViewer} />;
    }
    return (
      <p
        className={isViewer ? "mt-1 text-t2 leading-relaxed" : undefined}
        style={!isViewer ? { fontSize: 11.5, color: "#1e293b", lineHeight: 1.65 } : undefined}
      >
        {fallback}
      </p>
    );
  }

  const isViewer = variant === "viewer";

  return (
    <div
      className={isViewer ? "mt-2 max-h-40 overflow-auto rounded-md border border-amber-200 bg-white/80 dark:bg-gray-950/35 dark:border-amber-900" : undefined}
    >
      <div style={{ padding: isViewer ? "8px 10px 6px" : 0, marginBottom: isViewer ? 0 : 8 }}>
        <div
          style={{
            fontSize: isViewer ? 12.5 : 12,
            fontWeight: 700,
            color: isViewer ? "inherit" : "#1e293b",
          }}
        >
          {parsed.title}
        </div>
        {parsed.subtitle ? (
          <div
            className={isViewer ? "text-t3" : undefined}
            style={{ fontSize: isViewer ? 11 : 10.5, color: isViewer ? undefined : "#64748b", marginTop: 2 }}
          >
            {parsed.subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ overflowX: "auto", border: isViewer ? "none" : "1px solid #fde68a", borderRadius: isViewer ? 0 : 5 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isViewer ? 420 : 280 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: isViewer ? "7px 10px" : "6px 7px",
                  background: isViewer ? "#fffbeb" : "#fffbeb",
                  color: "#92400e",
                  fontSize: isViewer ? 11 : 10,
                  fontWeight: 700,
                  borderTop: isViewer ? "1px solid #fde68a" : "none",
                  borderBottom: "1px solid #fde68a",
                }}
              >
                Line item
              </th>
              {parsed.headers.map((header) => (
                <th
                  key={header}
                  style={{
                    textAlign: "right",
                    padding: isViewer ? "7px 10px" : "6px 7px",
                    background: "#fffbeb",
                    color: "#92400e",
                    fontSize: isViewer ? 11 : 10,
                    fontWeight: 700,
                    borderTop: isViewer ? "1px solid #fde68a" : "none",
                    borderBottom: "1px solid #fde68a",
                    whiteSpace: "nowrap",
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, rowIndex) => (
              <tr key={`${row[0]}-${rowIndex}`}>
                <td
                  style={{
                    padding: isViewer ? "7px 10px" : "6px 7px",
                    color: isViewer ? "inherit" : "#1e293b",
                    fontSize: isViewer ? 12 : 10.5,
                    lineHeight: 1.35,
                    borderTop: rowIndex === 0 ? "none" : "1px solid #fef3c7",
                    maxWidth: isViewer ? 220 : 130,
                  }}
                >
                  {row[0]}
                </td>
                {parsed.headers.map((header, index) => (
                  <td
                    key={`${row[0]}-${header}`}
                    style={{
                      padding: isViewer ? "7px 10px" : "6px 7px",
                      color: isViewer ? "inherit" : "#334155",
                      fontSize: isViewer ? 12 : 10.5,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      borderTop: rowIndex === 0 ? "none" : "1px solid #fef3c7",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCell(row[index + 1] || "")}
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

function MarkdownSnippet({ text, isViewer }: { text: string; isViewer: boolean }) {
  const cellPad = isViewer ? "6px 9px" : "4px 7px";
  const fontSize = isViewer ? 12 : 10.5;
  const headerFontSize = isViewer ? 11 : 9.5;

  return (
    <div
      className={isViewer ? "text-t2 leading-relaxed" : undefined}
      style={!isViewer ? { fontSize: 11.5, color: "#1e293b", lineHeight: 1.55 } : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => (
            <p style={{ margin: "0 0 6px" }} {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul style={{ margin: "0 0 6px", paddingLeft: 18 }} {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol style={{ margin: "0 0 6px", paddingLeft: 18 }} {...props} />
          ),
          li: ({ node, ...props }) => (
            <li style={{ marginBottom: 2, lineHeight: 1.5 }} {...props} />
          ),
          table: ({ node, ...props }) => (
            <div style={{ overflowX: "auto", margin: "4px 0", border: "1px solid #fde68a", borderRadius: 4 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize,
                  fontVariantNumeric: "tabular-nums",
                }}
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead style={{ background: "#fffbeb" }} {...props} />
          ),
          th: ({ node, style, ...props }) => (
            <th
              style={{
                padding: cellPad,
                textAlign: "left",
                fontSize: headerFontSize,
                fontWeight: 700,
                color: "#92400e",
                borderBottom: "1px solid #fde68a",
                whiteSpace: "nowrap",
                ...(style || {}),
              }}
              {...props}
            />
          ),
          td: ({ node, style, ...props }) => (
            <td
              style={{
                padding: cellPad,
                color: isViewer ? "inherit" : "#334155",
                borderTop: "1px solid #fef3c7",
                whiteSpace: "nowrap",
                ...(style || {}),
              }}
              {...props}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
