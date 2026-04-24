"use client";
import type { DocCoverage } from "./types";

interface Props {
  dealBreakers: number;
  material: number;
  uncovered: DocCoverage[];
  onDismiss: () => void;
  onViewFlags: () => void;
  onRunScan?: () => void;
}

export default function RedFlagBanner({
  dealBreakers,
  material,
  uncovered,
  onDismiss,
  onViewFlags,
  onRunScan,
}: Props) {
  const hasFindings = dealBreakers > 0 || material > 0;
  return (
    <div
      className="flex items-center gap-2.5 flex-shrink-0"
      style={{
        background: "#fff1f2",
        borderBottom: "1px solid #fecdd3",
        padding: "7px 20px",
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#dc2626"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {(dealBreakers > 0 || material > 0) && (
        <span style={{ fontSize: 13, color: "#991b1b", fontWeight: 600 }}>
          {dealBreakers > 0 && (
            <>
              {dealBreakers} deal-breaker{dealBreakers !== 1 ? "s" : ""}
            </>
          )}
          {dealBreakers > 0 && material > 0 && " · "}
          {material > 0 && (
            <>
              {material} material finding{material !== 1 ? "s" : ""}
            </>
          )}
        </span>
      )}
      {uncovered.length > 0 && (
        <>
          {(dealBreakers > 0 || material > 0) && <span style={{ color: "#fda4af" }}>·</span>}
          <span style={{ fontSize: 13, color: "#9a3412", fontWeight: 500 }}>
            ⚠ {uncovered.length} document{uncovered.length > 1 ? "s" : ""} not yet analyzed:{" "}
            <strong>{uncovered.map((d) => d.short).join(", ")}</strong>
          </span>
        </>
      )}
      {hasFindings ? (
        <button
          onClick={onViewFlags}
          style={{
            marginLeft: 6,
            fontSize: 11,
            color: "#dc2626",
            fontWeight: 600,
            background: "none",
            border: "1px solid #fca5a5",
            borderRadius: 4,
            padding: "2px 9px",
            cursor: "pointer",
          }}
        >
          View all findings →
        </button>
      ) : onRunScan ? (
        <button
          onClick={onRunScan}
          style={{
            marginLeft: 6,
            fontSize: 11,
            color: "white",
            fontWeight: 600,
            background: "#dc2626",
            border: "1px solid #dc2626",
            borderRadius: 4,
            padding: "2px 9px",
            cursor: "pointer",
          }}
        >
          Run Proactive Scan →
        </button>
      ) : null}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          marginLeft: "auto",
          color: "#94a3b8",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}
