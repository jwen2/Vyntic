"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ddTheme } from "@/components/dd/types";
import { ACCENT, tint } from "./theme";

type Theme = "light" | "dark";

interface WorkflowMarkdownProps {
  children: string;
  theme: Theme;
  compact?: boolean;
}

export default function WorkflowMarkdown({
  children,
  theme,
  compact = false,
}: WorkflowMarkdownProps) {
  const c = ddTheme(theme);
  const components: Components = {
    h1: ({ children: nodeChildren }) => (
      <h1 style={{ margin: "0 0 10px", fontSize: compact ? 16 : 20, lineHeight: 1.25, fontWeight: 700, color: c.t1 }}>
        {nodeChildren}
      </h1>
    ),
    h2: ({ children: nodeChildren }) => (
      <h2 style={{ margin: compact ? "14px 0 6px" : "20px 0 8px", fontSize: compact ? 14 : 17, lineHeight: 1.35, fontWeight: 700, color: c.t1 }}>
        {nodeChildren}
      </h2>
    ),
    h3: ({ children: nodeChildren }) => (
      <h3 style={{ margin: compact ? "12px 0 5px" : "16px 0 6px", fontSize: compact ? 13 : 15, lineHeight: 1.35, fontWeight: 700, color: c.t1 }}>
        {nodeChildren}
      </h3>
    ),
    p: ({ children: nodeChildren }) => (
      <p style={{ margin: compact ? "0 0 7px" : "0 0 10px", fontSize: compact ? 12 : 13, lineHeight: compact ? 1.55 : 1.7, color: c.t2 }}>
        {nodeChildren}
      </p>
    ),
    ul: ({ children: nodeChildren }) => (
      <ul style={{ margin: compact ? "4px 0 8px" : "6px 0 12px", paddingLeft: 18, color: c.t2 }}>
        {nodeChildren}
      </ul>
    ),
    ol: ({ children: nodeChildren }) => (
      <ol style={{ margin: compact ? "4px 0 8px" : "6px 0 12px", paddingLeft: 20, color: c.t2 }}>
        {nodeChildren}
      </ol>
    ),
    li: ({ children: nodeChildren }) => (
      <li style={{ marginBottom: compact ? 4 : 6, fontSize: compact ? 12 : 13, lineHeight: compact ? 1.5 : 1.65 }}>
        {nodeChildren}
      </li>
    ),
    table: ({ children: nodeChildren }) => (
      <div style={{ overflowX: "auto", margin: compact ? "8px 0" : "12px 0", border: `1px solid ${c.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 11 : 12 }}>
          {nodeChildren}
        </table>
      </div>
    ),
    th: ({ children: nodeChildren }) => (
      <th style={{ padding: "7px 9px", textAlign: "left", color: c.t2, background: c.surfaceAlt, borderBottom: `1px solid ${c.border}`, fontWeight: 700 }}>
        {nodeChildren}
      </th>
    ),
    td: ({ children: nodeChildren }) => (
      <td style={{ padding: "7px 9px", color: c.t1, borderTop: `1px solid ${c.border}`, verticalAlign: "top" }}>
        {nodeChildren}
      </td>
    ),
    blockquote: ({ children: nodeChildren }) => (
      <blockquote style={{ margin: "10px 0", padding: "8px 12px", borderLeft: `3px solid ${ACCENT}`, background: tint(ACCENT, 8), color: c.t2 }}>
        {nodeChildren}
      </blockquote>
    ),
    code: ({ children: nodeChildren }) => (
      <code style={{ fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: "0.92em", background: c.surfaceAlt, border: `1px solid ${c.border}`, borderRadius: 4, padding: "1px 4px", color: c.t1 }}>
        {nodeChildren}
      </code>
    ),
    strong: ({ children: nodeChildren }) => (
      <strong style={{ color: c.t1, fontWeight: 700 }}>{nodeChildren}</strong>
    ),
    a: ({ children: nodeChildren, href }) => (
      <a href={href} style={{ color: ACCENT, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {nodeChildren}
      </a>
    ),
  };

  return (
    <div style={{ color: c.t1, overflowWrap: "anywhere" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
