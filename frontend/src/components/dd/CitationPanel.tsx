import type { Citation } from "@/lib/api";
import CitationSnippet, { SPREADSHEET_FILE_RE } from "./CitationSnippet";

interface Props {
  citation: Citation;
  onClose: () => void;
  onOpenDocument: (c: Citation) => void;
}

export default function CitationPanel({ citation, onClose, onOpenDocument }: Props) {
  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const border = "var(--border)";
  const text = "var(--text-1)";
  const muted = "var(--text-3)";

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
        width: 344,
        flexShrink: 0,
        background: surface,
        overflowY: "auto",
        borderLeft: `1px solid ${border}`,
      }}
    >
      <div
        className="flex items-start gap-3 border-b px-4 py-4"
        style={{
          borderBottomColor: border,
          background: surfaceAlt,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-mono-plex"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: muted,
              marginBottom: 6,
            }}
          >
            Source evidence
          </div>
          <div
            title={citation.source_file}
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {citation.source_file}
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>
            {locatorLabel} {citation.page}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full border text-lg"
          style={{
            borderColor: border,
            color: muted,
            background: surface,
          }}
        >
          ×
        </button>
      </div>

      <div className="m-4 rounded-[1.5rem] border" style={{ borderColor: border, background: surfaceAlt }}>
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderBottomColor: border }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="font-mono-plex" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: muted }}>
            {locatorLabel} {citation.page}
          </span>
        </div>
        <div className="p-4">
          <div
            className="rounded-[1.25rem] border px-4 py-4"
            style={{
              background: surface,
              borderColor: border,
            }}
          >
            <div
              className="font-mono-plex"
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: muted,
                marginBottom: 10,
              }}
            >
              Cited passage
            </div>
            <CitationSnippet sourceFile={citation.source_file} text={citation.text_snippet} />
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div
          className="font-mono-plex"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: muted,
            marginBottom: 10,
          }}
        >
          Details
        </div>
        <div className="rounded-[1.5rem] border px-4 py-3" style={{ borderColor: border, background: surfaceAlt }}>
          {([
            ["Document", citation.source_file],
            [locatorLabel, String(citation.page)],
            ["Source type", docType],
          ] as const).map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0"
              style={{ borderBottomColor: border }}
            >
              <span style={{ fontSize: 12, color: muted }}>{label}</span>
              <span
                title={value}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: text,
                  maxWidth: 180,
                  textAlign: "right",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => onOpenDocument(citation)}
          className="mt-4 w-full rounded-full px-4 py-3 text-sm font-medium"
          style={{
            background: "var(--text-1)",
            color: "var(--bg)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Open in document viewer
        </button>
      </div>
    </div>
  );
}
