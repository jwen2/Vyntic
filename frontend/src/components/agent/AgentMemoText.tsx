"use client";

import React from "react";
import { ddTheme } from "@/components/dd/types";
import { useTheme } from "@/components/ThemeProvider";
import { CitBadge } from "@/components/dd/AnswerText";
import type { Citation } from "@/lib/api";
import type { AgentEvidenceItem, AgentLocalCitation } from "./types";

type MemoBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function normalizeMemoText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+(#{1,3}\s+)/g, "\n$1")
    .replace(/([^\n])\s+([*-]\s+)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
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
  const pattern = /(\*\*[^*]+\*\*)|(\(([^()\s][^()]*?\.[A-Za-z0-9]+)\s+p\.?\s*(\d+)\))/g;
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
      const page = parseInt(m[4], 10);
      const item = findEvidence(evidence, filename, page);
      if (item && onCitation) {
        const localCit = evidenceToCitation(item, String(key));
        const badgeCit: Citation = {
          source_file: item.source_file,
          page: item.page,
          text_snippet: item.chunk || "",
        };
        tokens.push(
          <CitBadge
            key={`c${key++}`}
            cit={badgeCit}
            id={localCit.id}
            active={activeCitId === localCit.id}
            onClick={() => onCitation(localCit)}
          />,
        );
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
