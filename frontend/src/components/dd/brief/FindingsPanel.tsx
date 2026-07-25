// Scan findings list with severity ordering and expandable detail.
// Extracted from DealBriefDashboard.tsx (FE5.4).

import { useCallback, useState } from "react";
import { SEV_COLOR, ddTheme, type Finding } from "../types";
import { CountBadge, Placeholder, SeverityDot, lineClamp } from "./parts";

export function FindingsPanel({
  findings,
  gapCount,
  inconsistencyCount,
  theme,
  onSelectFinding,
  onOpenSource,
}: {
  findings: Finding[];
  gapCount: number;
  inconsistencyCount: number;
  theme: "light" | "dark";
  onSelectFinding: (finding: Finding) => void;
  onOpenSource?: (finding: Finding) => void;
}) {
  const c = ddTheme(theme);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleFinding = useCallback(
    (finding: Finding) => {
      setExpandedIds((prev) => ({ ...prev, [finding.id]: !prev[finding.id] }));
      onSelectFinding(finding);
    },
    [onSelectFinding],
  );

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
          What matters most
        </div>
        <div style={{ flex: 1 }} />
        <CountBadge label="Gaps" count={gapCount} theme={theme} />
        <CountBadge label="Mismatches" count={inconsistencyCount} theme={theme} />
      </div>
      {findings.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {findings.map((finding) => {
            const expanded = Boolean(expandedIds[finding.id]);
            const hasSeparateDetail = finding.detail.trim() !== finding.title.trim();
            const canExpand = hasSeparateDetail || finding.title.length > 110;

            return (
              <div
                key={finding.id}
                style={{
                  padding: 12,
                  borderRadius: 18,
                  background: c.surfaceAlt,
                  border: `1px solid ${c.border}`,
                  minWidth: 0,
                }}
              >
                <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <SeverityDot severity={finding.sev} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[finding.sev].color }}>{SEV_COLOR[finding.sev].label}</span>
                  <span style={{ fontSize: 10, color: c.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {finding.src}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 650,
                    color: c.t1,
                    lineHeight: 1.45,
                    ...(expanded ? {} : lineClamp(4)),
                  }}
                >
                  {finding.title}
                </div>
                {expanded && hasSeparateDetail && (
                  <div style={{ marginTop: 8, fontSize: 11, color: c.t2, lineHeight: 1.55 }}>
                    {finding.detail}
                  </div>
                )}
                {(canExpand || finding.sourceCitation) && (
                  <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 10 }}>
                    {canExpand && (
                      <button
                        type="button"
                        onClick={() => toggleFinding(finding)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          fontSize: 10,
                          fontWeight: 700,
                          color: c.t2,
                          cursor: "pointer",
                        }}
                      >
                        {expanded ? "Show less" : "Show more"}
                      </button>
                    )}
                    {finding.sourceCitation && (
                      <button
                        type="button"
                        onClick={() => onOpenSource?.(finding)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          fontSize: 10,
                          fontWeight: 700,
                          color: c.t2,
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        Open source
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Placeholder text="Scan findings will appear here" theme={theme} />
      )}
    </div>
  );
}

export default FindingsPanel;
