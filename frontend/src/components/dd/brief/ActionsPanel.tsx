// Analyst next-actions list. Extracted from DealBriefDashboard.tsx (FE5.4).

import { useState } from "react";
import Card from "@/components/ui/Card";
import { type Citation } from "@/lib/api";
import { type ThesisBullet } from "./config";
import { Placeholder, SourceChip, lineClamp } from "./parts";

export function ActionsPanel({ actions, citations, onCit }: { actions: ThesisBullet[]; citations: (Citation | null)[]; onCit?: (sourceIdx: number) => void }) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  return (
    <Card level="panel">
      <div
        className="font-mono-plex text-t3"
        style={{
          fontSize: 10,
          fontWeight: 700,
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        Analyst next actions
      </div>
      {actions.length > 0 ? (
        <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
          {actions.slice(0, 5).map((action, idx) => {
            const actionId = `${idx}-${action.sourceIdx ?? "na"}-${action.text.slice(0, 32)}`;
            const expanded = Boolean(expandedIds[actionId]);
            const canExpand = action.text.length > 120;

            return (
              <li key={`${action.text}-${idx}`} className="flex" style={{ gap: 8, alignItems: "flex-start" }}>
                <span className="font-mono-dm border border-edge bg-surface-alt text-t2" style={{ width: 22, height: 22, borderRadius: "50%", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {idx + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="text-t1"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      ...(expanded ? {} : lineClamp(3)),
                    }}
                  >
                    {action.text}
                  </div>
                  {(action.sourceIdx !== undefined || canExpand) && (
                    <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 6 }}>
                      {action.sourceIdx !== undefined && (
                        <SourceChip citation={citations[action.sourceIdx - 1]} index={action.sourceIdx} onClick={onCit ? () => onCit(action.sourceIdx!) : undefined} />
                      )}
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => setExpandedIds((prev) => ({ ...prev, [actionId]: !prev[actionId] }))}
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
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Placeholder text="Next actions will be generated from the scan" />
      )}
    </Card>
  );
}

export default ActionsPanel;
