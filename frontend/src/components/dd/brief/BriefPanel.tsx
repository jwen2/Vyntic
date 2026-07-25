// The two KV panels (snapshot / transaction) and their inline-editable
// fields. Extracted from DealBriefDashboard.tsx (FE5.4).

import { useEffect, useState } from "react";
import { type Citation } from "@/lib/api";
import { ACCENT, ddTheme } from "../types";
import { type BriefField } from "./config";
import { extractBullets } from "./parse";
import { BulletList, OverrideBadge, Placeholder, SourceChip } from "./parts";

export function BriefPanel({
  title,
  panelKey,
  fields,
  citations,
  fallback,
  theme,
  onCit,
  onOverride,
}: {
  title: string;
  panelKey: string;
  fields: BriefField[];
  citations: (Citation | null)[];
  fallback?: string;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  onOverride?: (panelKey: string, label: string, value: string | null) => void;
}) {
  const c = ddTheme(theme);
  const fallbackItems = fields.length === 0 ? extractBullets(fallback).slice(0, 4) : [];

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
        minHeight: 220,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: c.t3,
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {title}
      </div>
      {fields.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fields.slice(0, 7).map((field) => (
            <EditableField
              key={`${panelKey}-${field.label}`}
              field={field}
              citation={field.sourceIdx ? citations[field.sourceIdx - 1] : undefined}
              theme={theme}
              onCit={onCit}
              onSave={onOverride ? (value) => onOverride(panelKey, field.label, value) : undefined}
            />
          ))}
        </div>
      ) : fallbackItems.length > 0 ? (
        <BulletList items={fallbackItems} theme={theme} />
      ) : (
        <Placeholder text="Awaiting scan output" theme={theme} />
      )}
    </div>
  );
}

export function EditableField({
  field,
  citation,
  theme,
  onCit,
  onSave,
}: {
  field: BriefField;
  citation?: Citation | null;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  onSave?: (value: string | null) => void;
}) {
  const c = ddTheme(theme);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(field.value);
  }, [field.value, editing]);

  const editable = Boolean(onSave);

  const commit = () => {
    if (!onSave) return;
    setEditing(false);
    const next = draft.trim();
    if (next === field.value) return;
    onSave(next || null);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(field.value);
  };

  return (
    <div
      style={{
        minWidth: 0,
        padding: "10px 12px",
        borderRadius: 16,
        border: `1px solid ${c.border}`,
        background: c.surfaceAlt,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center" style={{ gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: "uppercase" }}>{field.label}</span>
        {field.override && <OverrideBadge theme={theme} />}
        <span style={{ flex: 1 }} />
        {editable && !editing && (hover || field.override) && (
          <button
            onClick={() => setEditing(true)}
            title="Edit value"
            style={{ background: "transparent", border: "none", color: c.t3, cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
          >
            ✎
          </button>
        )}
        {editable && !editing && hover && field.override && (
          <button
            onClick={() => onSave?.(null)}
            title="Reset to scan output"
            style={{ background: "transparent", border: "none", color: c.t3, cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
          >
            ↺
          </button>
        )}
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          style={{
            width: "100%",
            marginTop: 4,
            padding: "8px 10px",
            fontSize: 12,
            color: c.t1,
            background: c.surface,
            border: `1px solid ${ACCENT}`,
            borderRadius: 12,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <div
          onClick={editable ? () => setEditing(true) : undefined}
          style={{
            marginTop: 4,
            fontSize: 12,
            color: c.t1,
            lineHeight: 1.5,
            overflowWrap: "anywhere",
            cursor: editable ? "text" : "default",
          }}
        >
          {field.value}
          {field.sourceIdx !== undefined && (
            <SourceChip citation={citation} index={field.sourceIdx} onClick={onCit ? () => onCit(field.sourceIdx!) : undefined} />
          )}
        </div>
      )}
    </div>
  );
}

export default BriefPanel;
