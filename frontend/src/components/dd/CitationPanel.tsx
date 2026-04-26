"use client";
import type { Citation } from "@/lib/api";
import CitationSnippet, { SPREADSHEET_FILE_RE } from "./CitationSnippet";

interface Props {
  citation: Citation;
  onClose: () => void;
  onOpenDocument: (c: Citation) => void;
}

export default function CitationPanel({ citation, onClose, onOpenDocument }: Props) {
  const isSpreadsheet = SPREADSHEET_FILE_RE.test(citation.source_file);
  const locatorLabel = isSpreadsheet ? "Sheet" : "Page";
  const docType = citation.source_file.includes("CIM")
    ? "CIM (Primary)"
    : citation.source_file.includes("QoE")
    ? "QoE Report (Primary)"
    : citation.source_file.includes("Legal")
    ? "Legal DD"
    : isSpreadsheet
    ? "Financial Model"
    : citation.source_file.includes("Operational") || citation.source_file.includes("Ops")
    ? "Operational DD"
    : "Source document";

  return (
    <div
      className="dd-slide-in flex flex-col"
      style={{
        width: 336,
        flexShrink: 0,
        background: "white",
        overflowY: "auto",
        borderLeft: "1px solid #e2e8f0",
      }}
    >
      {/* Header */}
      <div
        className="flex items-start gap-2.5 flex-shrink-0"
        style={{
          padding: "13px 16px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fafafa",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 3,
            }}
          >
            Source Evidence
          </div>
          <div
            title={citation.source_file}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#1e293b",
              marginBottom: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {citation.source_file}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{locatorLabel} {citation.page}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            color: "#94a3b8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: 2,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Snippet preview */}
      <div
        style={{
          margin: 14,
          borderRadius: 8,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "7px 12px",
            background: "#f1f5f9",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{ fontSize: 10, color: "#64748b" }}>{locatorLabel} {citation.page}</span>
        </div>
        <div style={{ padding: 14 }}>
          {[80, 65, 90, 72].map((w, i) => (
            <div
              key={`pre-${i}`}
              style={{
                height: 7,
                background: "#e2e8f0",
                borderRadius: 2,
                marginBottom: 5,
                width: `${w}%`,
              }}
            />
          ))}

          <div
            style={{
              background: "#fefce8",
              border: "1.5px solid #fde047",
              borderRadius: 5,
              padding: "8px 10px",
              margin: "14px 0 8px",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -8,
                left: 8,
                fontSize: 9,
                fontWeight: 700,
                color: "#a16207",
                background: "#fef9c3",
                padding: "1px 5px",
                borderRadius: 3,
                border: "1px solid #fde047",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Cited passage
            </div>
            <CitationSnippet sourceFile={citation.source_file} text={citation.text_snippet} />
          </div>

          {[60, 75].map((w, i) => (
            <div
              key={`post-${i}`}
              style={{
                height: 7,
                background: "#e2e8f0",
                borderRadius: 2,
                marginBottom: 5,
                width: `${w}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div style={{ padding: "0 14px 14px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 8,
          }}
        >
          Details
        </div>
        {([
          ["Document", citation.source_file],
          [locatorLabel, String(citation.page)],
          ["Source type", docType],
        ] as const).map(([l, v]) => (
          <div
            key={l}
            className="flex justify-between items-center"
            style={{ padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}
          >
            <span style={{ fontSize: 12, color: "#64748b" }}>{l}</span>
            <span
              title={v}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#334155",
                maxWidth: 180,
                textAlign: "right",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {v}
            </span>
          </div>
        ))}
        <button
          onClick={() => onOpenDocument(citation)}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "9px 0",
            background: "#0f172a",
            color: "white",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Open in Document Viewer
        </button>
      </div>
    </div>
  );
}
