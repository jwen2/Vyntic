// Investment thesis columns (thesis / levers / exit / risks).
// Extracted from DealBriefDashboard.tsx (FE5.4).

import { type Citation } from "@/lib/api";
import { ACCENT } from "../types";
import { type ThesisBullet, type ThesisSections } from "./config";
import { extractBulletsWithSources } from "./parse";
import { Placeholder, SourceChip } from "./parts";

export function ThesisPanel({
  sections,
  citations,
  fallback,
  onCit,
  loading,
}: {
  sections: ThesisSections;
  citations: (Citation | null)[];
  fallback?: string;
  onCit?: (sourceIdx: number) => void;
  loading: boolean;
}) {
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
      className="border border-edge bg-surface"
      style={{
        padding: 16,
        borderRadius: 24,
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
        <div
          className="font-mono-plex text-t3"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Investment thesis
        </div>
        {loading && (
          <span className="text-t2" style={{ fontSize: 10, fontWeight: 700 }}>Synthesizing…</span>
        )}
      </div>
      {hasAny ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {blocks.map((block) => (
            <ThesisColumn key={block.id} label={block.label} accent={block.accent} bullets={block.bullets} citations={citations} onCit={onCit} />
          ))}
        </div>
      ) : fallbackBullets.length > 0 ? (
        <ThesisColumn label="Synthesis" accent={ACCENT} bullets={fallbackBullets} citations={citations} onCit={onCit} />
      ) : (
        <Placeholder text="Thesis synthesis will appear here once the scan completes" />
      )}
    </div>
  );
}

export function ThesisColumn({
  label,
  accent,
  bullets,
  citations,
  onCit,
}: {
  label: string;
  accent: string;
  bullets: ThesisBullet[];
  citations: (Citation | null)[];
  onCit?: (sourceIdx: number) => void;
}) {
  if (bullets.length === 0) {
    return (
      <div className="border border-edge bg-surface-alt" style={{ padding: 12, borderRadius: 18, minHeight: 110 }}>
        <ThesisColumnHeader label={label} accent={accent} />
        <div className="text-t3" style={{ fontSize: 11, fontStyle: "italic" }}>Not synthesized</div>
      </div>
    );
  }
  return (
    <div className="border border-edge bg-surface-alt" style={{ padding: 12, borderRadius: 18 }}>
      <ThesisColumnHeader label={label} accent={accent} />
      <ul style={{ display: "flex", flexDirection: "column", gap: 7, margin: 0, padding: 0, listStyle: "none" }}>
        {bullets.slice(0, 5).map((bullet, idx) => (
          <li key={`${label}-${idx}`} className="flex text-t1" style={{ gap: 7, alignItems: "flex-start", fontSize: 12, lineHeight: 1.4 }}>
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

export function ThesisColumnHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="flex items-center" style={{ gap: 6, marginBottom: 7 }}>
      <span style={{ width: 4, height: 12, borderRadius: 2, background: accent }} />
      <span className="text-t2" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
    </div>
  );
}

export default ThesisPanel;
