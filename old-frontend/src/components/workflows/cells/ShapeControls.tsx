"use client";

import { useState } from "react";
import { ddTheme } from "@/components/dd/types";
import type { Citation } from "@/lib/api";
import type { ColumnFormat } from "@/lib/matrixColumnConfig";
import type { TabularCell, WorkflowColumn } from "@/lib/workflows";
import { ACCENT, AMBER, GREEN, RED, VIOLET, tint } from "../theme";
import CellRenderer from "./CellRenderer";

type Theme = "light" | "dark";

export const SHAPE_OPTIONS: Array<{
  value: ColumnFormat;
  label: string;
  glyph: string;
  example: string;
  color: string;
}> = [
  { value: "metric", label: "Metric", glyph: "#", example: "$50.4M · 12.5%", color: GREEN },
  { value: "date", label: "Date", glyph: "D", example: "Mar 31, 2026", color: GREEN },
  { value: "bool", label: "Boolean", glyph: "Y", example: "Yes / No", color: GREEN },
  { value: "enum", label: "Enum", glyph: "E", example: "High · Medium · Low", color: AMBER },
  { value: "prose", label: "Prose", glyph: "P", example: "Summary + caveats", color: ACCENT },
  { value: "list", label: "List", glyph: "L", example: "One item per line", color: AMBER },
  { value: "kv", label: "Key / Value", glyph: "K", example: "Cap · Basket · Survival", color: VIOLET },
];

export function normalizeShape(format: ColumnFormat): ColumnFormat {
  if (format === "number" || format === "percentage" || format === "monetary_amount" || format === "currency") return "metric";
  if (format === "yes_no") return "bool";
  if (format === "tag") return "enum";
  if (format === "text") return "prose";
  if (format === "bulleted_list") return "list";
  return format;
}

export function detectShape(input: string): (typeof SHAPE_OPTIONS)[number] | null {
  const text = input.toLowerCase();
  const pick = (format: ColumnFormat) => SHAPE_OPTIONS.find((shape) => shape.value === format) ?? null;
  if (/\b(list|enumerate|each|every)\b/.test(text)) return pick("list");
  if (/\bextract\b.+(?:,| and ).+(?:,| and )/.test(text)) return pick("kv");
  if (/\b(summarize|describe|explain|clause|provision|risk|caveat)\b/.test(text)) return pick("prose");
  if (/\b(revenue|ebitda|margin|nav|moic|dpi|irr|amount|price|\$|%|multiple)\b/.test(text)) return pick("metric");
  if (/\b(date|closing|expiration|vintage|maturity)\b/.test(text)) return pick("date");
  if (/^\s*(does|do|is|are|has|have|can|will|should)\b/.test(text) || /\byes\/?no\b/.test(text)) return pick("bool");
  return null;
}

export function ShapePicker({
  value,
  onChange,
  disabled,
  theme,
}: {
  value: ColumnFormat;
  onChange: (value: ColumnFormat) => void;
  disabled?: boolean;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const activeValue = normalizeShape(value);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 7 }}>
      {SHAPE_OPTIONS.map((shape) => {
        const active = shape.value === activeValue;
        return (
          <button
            key={shape.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(shape.value)}
            style={{
              minHeight: 74,
              textAlign: "left",
              padding: "8px 9px",
              borderRadius: 7,
              border: `1px solid ${active ? shape.color : c.border}`,
              background: active ? tint(shape.color, 13) : c.surfaceAlt,
              color: c.t1,
              cursor: disabled ? "not-allowed" : "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              opacity: disabled ? 0.65 : 1,
            }}
          >
            <span style={{ color: active ? shape.color : c.t3, fontFamily: "var(--font-mono, monospace)", fontSize: 13, fontWeight: 800 }}>
              {shape.glyph}
            </span>
            <span style={{ fontSize: 11, fontWeight: 750 }}>{shape.label}</span>
            <span style={{ fontSize: 9.5, color: c.t3, lineHeight: 1.25 }}>{shape.example}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ShapeOptionsInspector({
  format,
  tags,
  onTagsChange,
  disabled,
  theme,
}: {
  format: ColumnFormat;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const [input, setInput] = useState("");
  const shape = normalizeShape(format);
  const shapeMeta = SHAPE_OPTIONS.find((option) => option.value === shape);

  function commitTag() {
    const tag = input.trim();
    if (!tag) {
      setInput("");
      return;
    }
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      onTagsChange([...tags, tag]);
    }
    setInput("");
  }

  if (shape !== "enum") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 7,
          border: `1px solid ${c.border}`,
          background: c.surfaceAlt,
          color: c.t2,
          fontSize: 11,
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: tint(shapeMeta?.color ?? ACCENT, 15),
            color: shapeMeta?.color ?? ACCENT,
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 800,
          }}
        >
          {shapeMeta?.glyph ?? "P"}
        </span>
        <span>{shapeMeta?.label ?? "Prose"} cells use the standard parser for this answer shape.</span>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: 36,
        display: "flex",
        flexWrap: "wrap",
        gap: 5,
        padding: "7px 8px",
        borderRadius: 7,
        border: `1px solid ${c.border}`,
        background: c.surfaceAlt,
      }}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderRadius: 4,
            padding: "3px 7px",
            background: tint(AMBER, 16),
            color: AMBER,
            fontSize: 10,
            fontWeight: 750,
          }}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => onTagsChange(tags.filter((item) => item !== tag))}
              style={{ border: "none", background: "transparent", color: "currentColor", cursor: "pointer", padding: 0 }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commitTag}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitTag();
            } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
              onTagsChange(tags.slice(0, -1));
            }
          }}
          placeholder={tags.length ? "" : "Add allowed value"}
          style={{
            flex: 1,
            minWidth: 110,
            border: "none",
            background: "transparent",
            outline: "none",
            color: c.t1,
            fontSize: 12,
          }}
        />
      )}
    </div>
  );
}

export function CellRenderPreview({
  column,
  theme,
}: {
  column: {
    id?: string;
    label: string;
    prompt: string;
    format: ColumnFormat;
    tags?: string[] | null;
    order_index: number;
    is_derived?: boolean;
    formula?: string | null;
  };
  theme: Theme;
}) {
  const c = ddTheme(theme);
  const previewColumn: WorkflowColumn = {
    id: column.id || "preview_column",
    order_index: column.order_index || 1,
    label: column.label || "Preview",
    prompt: column.prompt || "",
    format: column.is_derived ? "prose" : normalizeShape(column.format),
    tags: column.tags ?? null,
    is_derived: Boolean(column.is_derived),
    formula: column.formula ?? null,
  };
  const cell = sampleCellForFormat(previewColumn.format, previewColumn.tags ?? []);

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        background: c.surface,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 9px",
          borderBottom: `1px solid ${c.border}`,
          background: c.surfaceAlt,
          fontSize: 10,
          color: c.t2,
          fontWeight: 700,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{previewColumn.label}</span>
        <span style={{ color: SHAPE_OPTIONS.find((shape) => shape.value === previewColumn.format)?.color ?? ACCENT }}>
          {SHAPE_OPTIONS.find((shape) => shape.value === previewColumn.format)?.label ?? "Prose"}
        </span>
      </div>
      <CellRenderer cell={cell} column={previewColumn} theme={theme} density="comfortable" />
    </div>
  );
}

function sampleCellForFormat(format: ColumnFormat, tags: string[]): TabularCell {
  const citation: Citation = {
    source_file: "QoE.pdf",
    page: 14,
    text_snippet: "Management reported LTM revenue of $50.4 million with a 12.5% EBITDA margin.",
    kind: "extracted",
    span_label: "Preview",
  };
  const base = {
    id: "preview_cell",
    run_id: "preview_run",
    row_key: "preview_row",
    column_id: "preview_column",
    status: "complete" as const,
    citations: [citation],
    model: "preview",
    fallback: false,
    duration_ms: 0,
    error_message: null,
    started_at: null,
    completed_at: null,
    quality: null,
  };
  const shape = normalizeShape(format);
  if (shape === "metric") {
    return { ...base, answer: "$50.4M for LTM 2025 [Source 1]", answer_formatted: { value: 50.4, unit: "$M", period: "LTM 2025", raw: "$50.4M" } };
  }
  if (shape === "date") {
    return { ...base, answer: "2026-03-31 [Source 1]", answer_formatted: { iso: "2026-03-31", granularity: "day" } };
  }
  if (shape === "bool") {
    return { ...base, answer: "Yes, consent is required. [Source 1]", answer_formatted: { value: true } };
  }
  if (shape === "enum") {
    const value = tags[0] || "Medium";
    return { ...base, answer: `${value}. [Source 1]`, answer_formatted: { value, allowed: tags.length ? tags : ["High", "Medium", "Low"] } };
  }
  if (shape === "list") {
    return {
      ...base,
      answer: "- Customer concentration\n- Unsupported add-backs [Source 1]",
      answer_formatted: { ordered: false, items: [{ text: "Customer concentration" }, { text: "Unsupported add-backs" }] },
    };
  }
  if (shape === "kv") {
    return {
      ...base,
      answer: "Basket: 1.0%; Cap: 10%; Survival: 18 months [Source 1]",
      answer_formatted: { pairs: [{ key: "Basket", value: "1.0%" }, { key: "Cap", value: "10%" }, { key: "Survival", value: "18 months" }] },
    };
  }
  return {
    ...base,
    answer: "Revenue quality is strong but depends on two large customers renewing their contracts. [Source 1]",
    answer_formatted: {
      summary: "Revenue quality is strong, with renewal concentration to monitor.",
      body: "Revenue quality is strong but depends on two large customers renewing their contracts.",
      caveats: [{ text: "Renewal timing is not fully disclosed.", severity: "warn" }],
    },
  };
}
