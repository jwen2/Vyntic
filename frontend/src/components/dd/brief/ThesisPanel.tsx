// Investment thesis columns (thesis / levers / exit / risks).
// Extracted from DealBriefDashboard.tsx (FE5.4).

import { type Citation } from "@/lib/api";
import { ACCENT, ddTheme } from "../types";
import { type ThesisBullet, type ThesisSections } from "./config";
import { extractBulletsWithSources } from "./parse";
import { Placeholder, SourceChip } from "./parts";

export function ThesisPanel({
  sections,
  citations,
  fallback,
  theme,
  onCit,
  loading,
}: {
  sections: ThesisSections;
  citations: (Citation | null)[];
  fallback?: string;
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
  loading: boolean;
}) {
  const c = ddTheme(theme);
  const blocks: Array<{ id: keyof ThesisSections; label: string; accent: string; bullets: ThesisBullet[] }> = [
    { id: "thesis", label: "Thesis", accent: ACCENT, bullets: sections.thesis },
    { id: "levers", label: "Value Creation Levers", accent: "#16a34a", bullets: sections.levers },
    { id: "exit", label: "Exit Considerations", accent: "#a855f7", bullets: sections.exit },
    { id: "risks", label: "Risks To Thesis", accent: "#f97316", bullets: sections.risks },
  ];
  const hasAny = blocks.some((b) => b.bullets.length > 0);
  const fallbackBullets: ThesisBullet[] = hasAny ? [] : extractBulletsWithSources(fallback).slice(0, 6);

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div
          className="font-mono-plex"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: c.t3,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Investment thesis
        </div>
        {loading && (
          <span style={{ fontSize: 10, fontWeight: 700, color: c.t2 }}>Synthesizing…</span>
        )}
      </div>
      {hasAny ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {blocks.map((block) => (
            <ThesisColumn key={block.id} label={block.label} accent={block.accent} bullets={block.bullets} citations={citations} theme={theme} onCit={onCit} />
          ))}
        </div>
      ) : fallbackBullets.length > 0 ? (
        <ThesisColumn label="Synthesis" accent={ACCENT} bullets={fallbackBullets} citations={citations} theme={theme} onCit={onCit} />
      ) : (
        <Placeholder text="Thesis synthesis will appear here once the scan completes" theme={theme} />
      )}
    </div>
  );
}

export function ThesisColumn({
  label,
  accent,
  bullets,
  citations,
  theme,
  onCit,
}: {
  label: string;
  accent: string;
  bullets: ThesisBullet[];
  citations: (Citation | null)[];
  theme: "light" | "dark";
  onCit?: (sourceIdx: number) => void;
}) {
  const c = ddTheme(theme);
  if (bullets.length === 0) {
    return (
      <div style={{ padding: 12, borderRadius: 18, border: `1px solid ${c.border}`, background: c.surfaceAlt, minHeight: 110 }}>
        <ThesisColumnHeader label={label} accent={accent} theme={theme} />
        <div style={{ fontSize: 11, color: c.t3, fontStyle: "italic" }}>Not synthesized</div>
      </div>
    );
  }
  return (
    <div style={{ padding: 12, borderRadius: 18, border: `1px solid ${c.border}`, background: c.surfaceAlt }}>
      <ThesisColumnHeader label={label} accent={accent} theme={theme} />
      <ul style={{ display: "flex", flexDirection: "column", gap: 7, margin: 0, padding: 0, listStyle: "none" }}>
        {bullets.slice(0, 5).map((bullet, idx) => (
          <li key={`${label}-${idx}`} className="flex" style={{ gap: 7, alignItems: "flex-start", fontSize: 12, color: c.t1, lineHeight: 1.4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, marginTop: 6, flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              {bullet.text}
              {bullet.sourceIdx !== undefined && (
                <SourceChip citation={citations[bullet.sourceIdx - 1]} index={bullet.sourceIdx} onClick={onCit ? () => onCit(bullet.sourceIdx!) : undefined} />
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ThesisColumnHeader({ label, accent, theme }: { label: string; accent: string; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div className="flex items-center" style={{ gap: 6, marginBottom: 7 }}>
      <span style={{ width: 4, height: 12, borderRadius: 2, background: accent }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: c.t2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
    </div>
  );
}

export default ThesisPanel;
