"use client";
import type { WorkstreamId } from "@/lib/queryTemplates";
import type { Finding } from "./types";

export interface WsTab {
  id: WorkstreamId;
  name: string;
  complete: number;
  total: number;
}

interface Props {
  tabs: WsTab[];
  active: WorkstreamId;
  onSelect: (id: WorkstreamId) => void;
  findings: Finding[];
}

export default function WsTabs({ tabs, active, onSelect, findings }: Props) {
  return (
    <div
      className="flex flex-shrink-0 overflow-x-auto dd-scroll"
      style={{
        borderBottom: "1px solid #e2e8f0",
        background: "white",
        padding: "0 16px",
      }}
    >
      {tabs.map((w) => {
        const isActive = w.id === active;
        const wsFlags = findings.filter((f) => f.ws === w.id).length;
        return (
          <button
            key={w.id}
            onClick={() => onSelect(w.id)}
            className="flex items-center gap-1.5"
            style={{
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "#0f172a" : "#64748b",
              background: "none",
              border: "none",
              borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color .12s",
            }}
          >
            {w.name}
            {w.total > 0 && (
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                {w.complete}/{w.total}
              </span>
            )}
            {wsFlags > 0 && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#ef4444",
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
