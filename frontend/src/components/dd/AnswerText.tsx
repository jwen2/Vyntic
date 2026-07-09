import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Citation } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { citationReferenceLabel } from "@/lib/citationLabels";
import { ACCENT, SEV_COLOR, tint } from "./types";
import CitationSnippet from "./CitationSnippet";

interface Props {
  text: string;
  citations: (Citation | null)[];
  activeCitId: string | null;
  onCit: (c: Citation, id: string) => void;
}

type Block =
  | { kind: "p"; content: React.ReactNode }
  | { kind: "heading"; level: number; content: React.ReactNode }
  | { kind: "list"; ordered: boolean; items: React.ReactNode[] }
  | { kind: "table"; heads: React.ReactNode[]; rows: React.ReactNode[][] }
  | { kind: "rule" }
  | { kind: "spacer" };

function citId(c: Citation, idx: number) {
  return `${c.source_file}_p${c.page}_${idx}`;
}

function citShort(c: Citation): string {
  return citationReferenceLabel(c);
}

function normalizeSeverityTag(raw: string): "DEAL-BREAKER" | "MATERIAL" | "NOTEWORTHY" {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "-");
  if (normalized === "DEAL-BREAKER" || normalized === "DEALBREAKER") return "DEAL-BREAKER";
  if (normalized === "MATERIAL") return "MATERIAL";
  return "NOTEWORTHY";
}

function renderBoldWithSources(
  str: string,
  key: string,
  citations: (Citation | null)[],
  activeCitId: string | null,
  onCit: (c: Citation, id: string) => void,
  isDark: boolean
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const sourceRe = /\[Source\s+(\d+)\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = sourceRe.exec(str)) !== null) {
    const before = str.slice(last, m.index);
    if (before) {
      parts.push(
        <strong
          key={`${key}-bt${k++}`}
          style={{ fontWeight: 600, color: isDark ? "#f1f5f9" : "#1e293b" }}
        >
          {before}
        </strong>
      );
    }

    const i = parseInt(m[1], 10) - 1;
    const c = citations[i];
    if (c) {
      const id = citId(c, i);
      parts.push(
        <CitBadge
          key={`${key}-bc${k++}`}
          cit={c}
          id={id}
          active={activeCitId === id}
          onClick={() => onCit(c, id)}
        />
      );
    }
    last = m.index + m[0].length;
  }

  const rest = str.slice(last);
  if (rest) {
    parts.push(
      <strong
        key={`${key}-be`}
        style={{ fontWeight: 600, color: isDark ? "#f1f5f9" : "#1e293b" }}
      >
        {rest}
      </strong>
    );
  }

  return parts;
}

/** Render a single line with inline formatting: **bold**, [SEVERITY], [Source N]. */
function renderInline(
  str: string,
  key: string,
  citations: (Citation | null)[],
  activeCitId: string | null,
  onCit: (c: Citation, id: string) => void,
  isDark: boolean
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*\[\s*(DEAL[\s-]?BREAKER|MATERIAL|NOTEWORTHY)\s*\]\s*(.+?)\*\*|\*\*\[\s*(DEAL[\s-]?BREAKER|MATERIAL|NOTEWORTHY)\s*\]\*\*|\[\s*(DEAL[\s-]?BREAKER|MATERIAL|NOTEWORTHY)\s*\]|\*\*(.+?)\*\*|\[Source\s+(\d+)\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(<span key={`${key}-t${k++}`}>{str.slice(last, m.index)}</span>);
    const sevWithTitle = m[1],
      sevTitle = m[2],
      sev1 = m[3],
      sev2 = m[4],
      bold = m[5],
      srcN = m[6];
    if (sevWithTitle || sev1 || sev2) {
      const raw = normalizeSeverityTag(sevWithTitle || sev1 || sev2);
      const sv =
        raw === "DEAL-BREAKER"
          ? "deal-breaker"
          : raw === "MATERIAL"
          ? "material"
          : "noteworthy";
      const s = SEV_COLOR[sv];
      const label = raw === "DEAL-BREAKER" ? "Deal breaker" : s.label;
      parts.push(
        <span
          key={`${key}-s${k++}`}
          className="font-mono-dm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "1px 6px",
            borderRadius: 4,
            background: s.bg,
            border: `1px solid ${s.border}`,
            fontSize: 10,
            fontWeight: 700,
            color: s.color,
          }}
        >
          {label}
        </span>
      );
      if (sevTitle) {
        parts.push(
          <strong
            key={`${key}-bt${k++}`}
            style={{ fontWeight: 650, color: isDark ? "#f8fafc" : "#0f172a" }}
          >
            {" "}
            {sevTitle.trim()}
          </strong>
        );
      }
    } else if (bold) {
      parts.push(...renderBoldWithSources(bold, `${key}-b${k++}`, citations, activeCitId, onCit, isDark));
    } else if (srcN) {
      const i = parseInt(srcN, 10) - 1;
      const c = citations[i];
      if (c) {
        const id = citId(c, i);
        parts.push(
          <CitBadge
            key={`${key}-c${k++}`}
            cit={c}
            id={id}
            active={activeCitId === id}
            onClick={() => onCit(c, id)}
          />
        );
      } else {
        k++;
      }
    }
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push(<span key={`${key}-e`}>{str.slice(last)}</span>);
  return parts;
}

export default function AnswerText({ text, citations, activeCitId, onCit }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const textColor = isDark ? "#cbd5e1" : "#334155";
  const headerText = isDark ? "#cbd5e1" : "#475569";
  const tableHeadBg = isDark ? "#1e293b" : "#f8fafc";
  const tableBorder = isDark ? "#334155" : "#e2e8f0";
  const rowBorder = isDark ? "#1e293b" : "#f1f5f9";
  const headingColor = isDark ? "#f8fafc" : "#0f172a";
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length,
        content: renderInline(
          headingMatch[2].trim(),
          `h${i}`,
          citations,
          activeCitId,
          onCit,
          isDark
        ),
      });
      i++;
      continue;
    }
    // Table
    if (line.startsWith("|") && i + 1 < lines.length && lines[i + 1].includes("---")) {
      const heads = line
        .split("|")
        .filter((c) => c.trim())
        .map((c, j) => renderInline(c.trim(), `th${i}${j}`, citations, activeCitId, onCit, isDark));
      i += 2;
      const rows: React.ReactNode[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .filter((c) => c.trim())
          .map((c, k) => renderInline(c.trim(), `td${i}${k}`, citations, activeCitId, onCit, isDark));
        rows.push(cells);
        i++;
      }
      blocks.push({ kind: "table", heads, rows });
      continue;
    }
    // List
    if (line.startsWith("- ") || /^\d+\. /.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || /^\d+\. /.test(lines[i]))) {
        const txt = lines[i].replace(/^- |^\d+\. /, "");
        items.push(
          <li key={i} style={{ marginBottom: 3, lineHeight: 1.6 }}>
            {renderInline(txt, `li${i}`, citations, activeCitId, onCit, isDark)}
          </li>
        );
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (line.trim() === "") {
      blocks.push({ kind: "spacer" });
    } else {
      blocks.push({
        kind: "p",
        content: renderInline(line, `p${i}`, citations, activeCitId, onCit, isDark),
      });
    }
    i++;
  }

  return (
    <>
      {blocks.map((b, idx) => {
        if (b.kind === "spacer") return <div key={idx} style={{ height: 6 }} />;
        if (b.kind === "rule") {
          return (
            <div
              key={idx}
              style={{
                height: 1,
                background: rowBorder,
                margin: "12px 0",
              }}
            />
          );
        }
        if (b.kind === "p")
          return (
            <div key={idx} style={{ lineHeight: 1.7, marginBottom: 3 }}>
              {b.content}
            </div>
          );
        if (b.kind === "heading") {
          const fontSize = b.level <= 2 ? 14 : 13;
          return (
            <div
              key={idx}
              style={{
                color: headingColor,
                fontSize,
                fontWeight: 700,
                lineHeight: 1.45,
                margin: b.level <= 2 ? "12px 0 5px" : "9px 0 4px",
              }}
            >
              {b.content}
            </div>
          );
        }
        if (b.kind === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={idx} style={{ paddingLeft: 18, margin: "6px 0" }}>
              {b.items}
            </Tag>
          );
        }
        // table
        return (
          <div key={idx} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {b.heads.map((h, j) => (
                    <th
                      key={j}
                      style={{
                        padding: "6px 10px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        color: headerText,
                        background: tableHeadBg,
                        borderBottom: `1px solid ${tableBorder}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, j) => (
                  <tr key={j} style={{ borderBottom: `1px solid ${rowBorder}` }}>
                    {row.map((cell, k) => (
                      <td
                        key={k}
                        style={{
                          padding: "5px 10px",
                          fontSize: 12,
                          color: textColor,
                          fontWeight: k === 0 ? 500 : 400,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export function CitBadge({
  cit,
  id,
  active,
  onClick,
}: {
  cit: Citation;
  id: string;
  active: boolean;
  onClick: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const POPOVER_WIDTH = 420;
  const POPOVER_MAX_HEIGHT = 320;

  const computePos = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= POPOVER_MAX_HEIGHT + 8
        ? rect.bottom + 6
        : Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 6);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)
    );
    return { top, left };
  };

  const cancelHide = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showAfterDelay = () => {
    cancelHide();
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
    showTimerRef.current = window.setTimeout(() => {
      const pos = computePos();
      if (pos) setPopoverPos(pos);
    }, 180);
  };

  // Short delay before hiding so the user can move the cursor from the badge
  // into the popover (e.g. to scroll a table) without it disappearing.
  const scheduleHide = () => {
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      setPopoverPos(null);
    }, 140);
  };

  const hideImmediate = () => {
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    cancelHide();
    setPopoverPos(null);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={showAfterDelay}
        onMouseLeave={scheduleHide}
        onFocus={showAfterDelay}
        onBlur={hideImmediate}
        aria-describedby={popoverPos ? `${id}-preview` : undefined}
        className="font-mono-dm"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "1px 6px",
          borderRadius: 4,
          background: active ? "var(--accent-tint)" : tint(ACCENT, 8),
          border: `1px solid ${active ? "var(--accent)" : "var(--accent-tint-border)"}`,
          color: "var(--accent-strong)",
          fontSize: 10,
          fontWeight: 500,
          cursor: "pointer",
          margin: "0 1px",
          lineHeight: 1.4,
          boxShadow: active ? "0 0 0 2px var(--accent-tint-border)" : "none",
          transition: "all .15s",
        }}
      >
        {citShort(cit)}
      </button>
      {popoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={`${id}-preview`}
            role="tooltip"
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              width: POPOVER_WIDTH,
              maxHeight: POPOVER_MAX_HEIGHT,
              display: "flex",
              flexDirection: "column",
              background: isDark ? "#0f172a" : "#ffffff",
              border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
              borderRadius: 8,
              boxShadow: isDark
                ? "0 10px 28px rgba(0,0,0,0.55)"
                : "0 10px 28px rgba(15,23,42,0.18)",
              fontSize: 12,
              lineHeight: 1.55,
              color: isDark ? "#cbd5e1" : "#334155",
              zIndex: 9998,
              whiteSpace: "normal",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
                padding: "8px 11px",
                borderBottom: `1px solid ${isDark ? "#1e293b" : "#f1f5f9"}`,
                fontSize: 11,
                fontWeight: 600,
                color: isDark ? "#f1f5f9" : "#0f172a",
                flexShrink: 0,
              }}
            >
              <span
                title={cit.source_file}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {cit.source_file}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: isDark ? "#94a3b8" : "#64748b",
                  flexShrink: 0,
                }}
              >
                Page {cit.page}
              </span>
            </div>
            <div
              className="text-gray-700 dark:text-gray-300"
              style={{
                padding: "8px 11px",
                overflow: "auto",
                flex: 1,
                minHeight: 0,
              }}
            >
              <CitationSnippet
                sourceFile={cit.source_file}
                text={cit.text_snippet}
                variant="viewer"
              />
            </div>
            <div
              style={{
                padding: "5px 11px 7px",
                borderTop: `1px solid ${isDark ? "#1e293b" : "#f1f5f9"}`,
                fontSize: 10,
                color: isDark ? "#64748b" : "#94a3b8",
                flexShrink: 0,
              }}
            >
              Click the badge to open in document viewer
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
