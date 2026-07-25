// The two KV panels (snapshot / transaction) and their inline-editable
// fields. Extracted from DealBriefDashboard.tsx (FE5.4).

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { type Citation } from "@/lib/api";
import { ACCENT } from "../types";
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
  const fallbackItems = fields.length === 0 ? extractBullets(fallback).slice(0, 4) : [];

  return (
    <Card level="panel" style={{ minHeight: 220 }}>
      <div
        className="font-mono-plex text-t3"
        style={{
          fontSize: 10,
          fontWeight: 700,
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
        <BulletList items={fallbackItems} />
      ) : (
        <Placeholder text="Awaiting scan output" />
      )}
    </Card>
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
      className="border border-edge bg-surface-alt"
      style={{
        minWidth: 0,
        padding: "10px 12px",
        borderRadius: 16,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center" style={{ gap: 6 }}>
        <span className="text-t3" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{field.label}</span>
        {field.override && <OverrideBadge theme={theme} />}
        <span style={{ flex: 1 }} />
        {editable && !editing && (hover || field.override) && (
          <button
            onClick={() => setEditing(true)}
            title="Edit value"
            className="text-t3"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
          >
            ✎
          </button>
        )}
        {editable && !editing && hover && field.override && (
          <button
            onClick={() => onSave?.(null)}
            title="Reset to scan output"
            className="text-t3"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}
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
          className="bg-surface text-t1"
          style={{
            width: "100%",
            marginTop: 4,
            padding: "8px 10px",
            fontSize: 12,
            border: `1px solid ${ACCENT}`,
            borderRadius: 12,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <div
          onClick={editable ? () => setEditing(true) : undefined}
          className="text-t1"
          style={{
            marginTop: 4,
            fontSize: 12,
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
