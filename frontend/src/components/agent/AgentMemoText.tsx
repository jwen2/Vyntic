"use client";

import React from "react";
import { ddTheme } from "@/components/dd/types";
import { useTheme } from "@/components/ThemeProvider";
import { CitBadge } from "@/components/dd/AnswerText";
import { fixMarkdownTables } from "@/lib/markdownUtils";
import type { Citation } from "@/lib/api";
import type { AgentEvidenceItem, AgentLocalCitation } from "./types";

type MemoBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; heads: string[]; rows: string[][] };

function normalizeMemoText(text: string): string {
  return fixMarkdownTables(text)
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s*(#{1,3}\s+)/g, "$1\n$2")
    .replace(/([.!?)\]])\s*([*-]\s+(?=[A-Z0-9]))/g, "$1\n$2")
    .replace(/([A-Za-z0-9][A-Za-z0-9 /&-]{2,80})([*-]\s+(?=[A-Z0-9]))/g, "$1\n$2")
    .replace(/([.!?)\]])\s*(\d+\.\s+)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MEMO_SECTION_HEADINGS = new Set([
  "executive summary",
  "key findings",
  "red flags",
  "open questions",
  "coverage gaps",
]);

function isLikelyPlainHeading(line: string): boolean {
  if (line.length > 72) return false;
  if (/[.!?)]$/.test(line) || /:\s*$/.test(line)) return false;
  if (/\|/.test(line) || /\([^)]+\bp\.?\s*\d+/i.test(line)) return false;

  const normalized = line.toLowerCase();
  if (MEMO_SECTION_HEADINGS.has(normalized)) return true;

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;

  const connectors = new Set(["and", "or", "of", "the", "to", "for", "in", "on", "vs", "with"]);
  const meaningful = words.filter((word) => !connectors.has(word.toLowerCase()));
  if (meaningful.length < 1) return false;

  return meaningful.every((word) => /^[A-Z0-9]/.test(word) || /^[A-Z]{2,}$/.test(word));
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/.test(line.trim());
}

function parseMemoBlocks(text: string): MemoBlock[] {
  const lines = normalizeMemoText(text).split("\n");
  const blocks: MemoBlock[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "p", text: paragraph.join(" ").trim() });
    paragraph = [];
  }

  function flushList() {
    if (!listType || !listItems.length) return;
    blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("|") && i + 1 < lines.length && isMarkdownTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();
      const heads = splitMarkdownTableRow(line);
      const rows: string[][] = [];
      let tableIndex = i + 2;
      while (tableIndex < lines.length && lines[tableIndex].trim().startsWith("|")) {
        const cells = splitMarkdownTableRow(lines[tableIndex]);
        rows.push(Array.from({ length: heads.length }, (_, cellIndex) => cells[cellIndex] || ""));
        tableIndex++;
      }
      blocks.push({ type: "table", heads, rows });
      i = tableIndex - 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3",
        text: heading[2].trim(),
      });
      continue;
    }

    if (isLikelyPlainHeading(line)) {
      flushParagraph();
      flushList();
      blocks.push({
        type: MEMO_SECTION_HEADINGS.has(line.toLowerCase()) ? "h2" : "h3",
        text: line,
      });
      continue;
    }

    const unordered = line.match(/^[*-]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1].trim());
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function findEvidence(
  evidence: AgentEvidenceItem[],
  filenameMaybeBasename: string,
  page: number,
): AgentEvidenceItem | undefined {
  // Memo references may use the bare filename (acme_saas_cim.pdf) while
  // evidence stores the same. Match exact first, then suffix match as a
  // fallback if the LLM stripped a path segment.
  const exact = evidence.find((e) => e.source_file === filenameMaybeBasename && e.page === page);
  if (exact) return exact;
  return evidence.find(
    (e) =>
      e.page === page &&
      (e.source_file.endsWith(filenameMaybeBasename) || filenameMaybeBasename.endsWith(e.source_file)),
  );
}

function evidenceToCitation(item: AgentEvidenceItem, key: string): AgentLocalCitation {
  const stem = item.source_file
    .replace(/^.*\//, "")
    .replace(/\.[^.]+$/, "")
    .split(/[_\s-]+/)
    .find((part) => part.length > 1) || "Doc";
  return {
    id: `memo-${item.source_file}-${item.page}-${key}`,
    source_file: item.source_file,
    page: item.page,
    snippet: item.chunk || "",
    sh: `${stem.slice(0, 7)}·p${item.page}`,
  };
}

function referenceToCitation(sourceFile: string, page: number, key: string, snippet = ""): AgentLocalCitation {
  const stem = sourceFile
    .replace(/^.*\//, "")
    .replace(/\.[^.]+$/, "")
    .split(/[_\s-]+/)
    .find((part) => part.length > 1) || "Doc";
  return {
    id: `memo-${sourceFile}-${page}-${key}`,
    source_file: sourceFile,
    page,
    snippet,
    sh: `${stem.slice(0, 7)}·p${page}`,
  };
}

function parseCitationPages(rawPages: string): number[] {
  const pages = rawPages
    .match(/\d+/g)
    ?.map((page) => parseInt(page, 10))
    .filter((page) => Number.isFinite(page) && page > 0) || [];
  return Array.from(new Set(pages));
}

interface InlineProps {
  text: string;
  evidence: AgentEvidenceItem[];
  onCitation?: (citation: AgentLocalCitation) => void;
  activeCitId?: string | null;
  boldColor: string;
}

function InlineMemo({ text, evidence, onCitation, activeCitId, boldColor }: InlineProps) {
  if (!text) return null;

  // Single pass that interleaves bold (**...**) and citation tokens.
  const tokens: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*)|(\(?\b([A-Za-z0-9][A-Za-z0-9._/-]*?\.(?:pdf|xlsx?|csv|docx?))\s*,?\s*(?:pp?\.?\s*)?(\d+(?:\s*(?:,|and|&)\s*(?:pp?\.?\s*)?\d+)*)\)?)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push(<span key={`t${key++}`}>{text.slice(last, m.index)}</span>);
    }
    if (m[1]) {
      // Bold
      tokens.push(
        <strong key={`b${key++}`} style={{ fontWeight: 700, color: boldColor }}>
          {m[1].slice(2, -2)}
        </strong>,
      );
    } else if (m[2]) {
      // Citation reference
      const filename = m[3];
      const pages = parseCitationPages(m[4]);
      const citationNodes = pages.map((page, pageIndex) => {
        const item = findEvidence(evidence, filename, page);
        if (!onCitation) {
          return <span key={`c${key}-missing-${pageIndex}`}>({filename} p.{page})</span>;
        }
        const localCit = item
          ? evidenceToCitation(item, `${key}-${pageIndex}`)
          : referenceToCitation(filename, page, `${key}-${pageIndex}`, "The memo cited this page as supporting evidence.");
        const badgeCit: Citation = {
          source_file: localCit.source_file,
          page: localCit.page,
          text_snippet: localCit.snippet || "",
        };
        return (
          <CitBadge
            key={`c${key}-badge-${pageIndex}`}
            cit={badgeCit}
            id={localCit.id}
            active={activeCitId === localCit.id}
            onClick={() => onCitation(localCit)}
          />
        );
      });
      if (citationNodes.some((node) => React.isValidElement(node))) {
        tokens.push(...citationNodes);
        key += citationNodes.length;
      } else {
        // No matching evidence — keep the original text so info isn't lost.
        tokens.push(<span key={`c${key++}`}>{m[2]}</span>);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    tokens.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
  }
  return <>{tokens}</>;
}

interface Props {
  text: string;
  evidence?: AgentEvidenceItem[];
  onCitation?: (citation: AgentLocalCitation) => void;
  activeCitId?: string | null;
}

export default function AgentMemoText({ text, evidence = [], onCitation, activeCitId }: Props) {
  const { theme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const tableHeadBg = isDark ? "#1e293b" : "#f8fafc";
  const tableBorder = isDark ? "#334155" : "#e2e8f0";
  const rowBorder = isDark ? "#1e293b" : "#f1f5f9";
  const blocks = parseMemoBlocks(text);

  const inline = (str: string) => (
    <InlineMemo
      text={str}
      evidence={evidence}
      onCitation={onCitation}
      activeCitId={activeCitId}
      boldColor={c.t1}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {blocks.map((block, index) => {
        if (block.type === "h1") {
          return (
            <h2 key={index} style={{ fontSize: 18, fontWeight: 700, color: c.t1, lineHeight: 1.3, margin: 0 }}>
              {inline(block.text)}
            </h2>
          );
        }
        if (block.type === "h2") {
          return (
            <h3 key={index} style={{ fontSize: 14, fontWeight: 700, color: c.t1, lineHeight: 1.35, margin: "4px 0 0", paddingTop: 6, borderTop: index > 1 ? `1px solid ${c.borderLight}` : "none" }}>
              {inline(block.text)}
            </h3>
          );
        }
        if (block.type === "h3") {
          return (
            <h4 key={index} style={{ fontSize: 12.5, fontWeight: 700, color: c.t2, lineHeight: 1.35, margin: "2px 0 -2px" }}>
              {inline(block.text)}
            </h4>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={index} style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7, listStyle: "none" }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 7, fontSize: 13, color: c.t2, lineHeight: 1.65 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.t3, marginTop: 9, justifySelf: "center" }} />
                  <span>{inline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={index} style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7, listStyle: "none", counterReset: "memo-counter" }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8, fontSize: 13, color: c.t2, lineHeight: 1.65 }}>
                  <span className="font-mono-dm" style={{ width: 22, height: 22, borderRadius: "50%", background: c.surfaceAlt, border: `1px solid ${c.border}`, color: c.t2, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    {itemIndex + 1}
                  </span>
                  <span>{inline(item)}</span>
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} style={{ overflowX: "auto", margin: "2px 0 4px" }}>
              <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {block.heads.map((head, headIndex) => (
                      <th
                        key={headIndex}
                        style={{
                          padding: "7px 10px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 600,
                          color: c.t2,
                          background: tableHeadBg,
                          borderBottom: `1px solid ${tableBorder}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {inline(head)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} style={{ borderBottom: `1px solid ${rowBorder}` }}>
                      {block.heads.map((_, cellIndex) => (
                        <td
                          key={cellIndex}
                          style={{
                            padding: "6px 10px",
                            fontSize: 12,
                            color: isDark ? "#cbd5e1" : "#334155",
                            fontWeight: cellIndex === 0 ? 500 : 400,
                            verticalAlign: "top",
                            whiteSpace: cellIndex === 0 ? "normal" : "nowrap",
                          }}
                        >
                          {inline(row[cellIndex] || "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "p") {
          return (
            <p key={index} style={{ margin: 0, fontSize: 13.5, color: isDark ? "#cbd5e1" : "#334155", lineHeight: 1.75 }}>
              {inline(block.text)}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
