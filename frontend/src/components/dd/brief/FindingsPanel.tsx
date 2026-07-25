// Scan findings list with severity ordering and expandable detail.
// Extracted from DealBriefDashboard.tsx (FE5.4).

import { useCallback, useState } from "react";
import Card from "@/components/ui/Card";
import { SEV_COLOR, type Finding } from "../types";
import { CountBadge, Placeholder, SeverityDot, lineClamp } from "./parts";

export function FindingsPanel({
  findings,
  gapCount,
  inconsistencyCount,
  onSelectFinding,
  onOpenSource,
}: {
  findings: Finding[];
  gapCount: number;
  inconsistencyCount: number;
  onSelectFinding: (finding: Finding) => void;
  onOpenSource?: (finding: Finding) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleFinding = useCallback(
    (finding: Finding) => {
      setExpandedIds((prev) => ({ ...prev, [finding.id]: !prev[finding.id] }));
      onSelectFinding(finding);
    },
    [onSelectFinding],
  );

  return (
    <Card level="panel">
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
          What matters most
        </div>
        <div style={{ flex: 1 }} />
        <CountBadge label="Gaps" count={gapCount} />
        <CountBadge label="Mismatches" count={inconsistencyCount} />
      </div>
      {findings.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {findings.map((finding) => {
            const expanded = Boolean(expandedIds[finding.id]);
            const hasSeparateDetail = finding.detail.trim() !== finding.title.trim();
            const canExpand = hasSeparateDetail || finding.title.length > 110;

            return (
              <Card
                key={finding.id}
                level="inner"
                tone="alt"
                style={{ minWidth: 0 }}
              >
                <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <SeverityDot severity={finding.sev} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[finding.sev].color }}>{SEV_COLOR[finding.sev].label}</span>
                  <span className="text-t3" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {finding.src}
                  </span>
                </div>
                <div
                  className="text-t1"
                  style={{
                    fontSize: 12,
                    fontWeight: 650,
                    lineHeight: 1.45,
                    ...(expanded ? {} : lineClamp(4)),
                  }}
                >
                  {finding.title}
                </div>
                {expanded && hasSeparateDetail && (
                  <div className="text-t2" style={{ marginTop: 8, fontSize: 11, lineHeight: 1.55 }}>
                    {finding.detail}
                  </div>
                )}
                {(canExpand || finding.sourceCitation) && (
                  <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 10 }}>
                    {canExpand && (
                      <button
                        type="button"
                        onClick={() => toggleFinding(finding)}
                        className="text-t2"
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          fontSize: 10,
                          fontWeight: 700,
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
                        className="text-t2"
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          fontSize: 10,
                          fontWeight: 700,
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
              </Card>
            );
          })}
        </div>
      ) : (
        <Placeholder text="Scan findings will appear here" />
      )}
    </Card>
  );
}

export default FindingsPanel;
