"use client";
import { useState } from "react";
import type { Finding, FindingStatus } from "./types";
import { SEV_COLOR } from "./types";

interface Props {
  f: Finding;
  active: boolean;
  onSelect: (f: Finding) => void;
  onStatus: (id: string, status: FindingStatus) => void;
  onNote: (id: string, note: string | null) => void;
}

export default function FlagItem({ f, active, onSelect, onStatus, onNote }: Props) {
  const s = SEV_COLOR[f.sev];
  const [hov, setHov] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [noteDraft, setNoteDraft] = useState(f.note || "");

  const conf = f.conf ?? 80;
  const confColor = conf >= 85 ? "#22c55e" : conf >= 65 ? "#f59e0b" : "#ef4444";

  const statusBg =
    f.status === "validated"
      ? "#14532d"
      : f.status === "rejected"
      ? "#3f3f46"
      : f.status === "review"
      ? "#422006"
      : null;

  const showActions = hov || active || noteMode;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 10px",
        marginBottom: 3,
        background: statusBg || (hov || active ? "#1e293b" : "transparent"),
        border: `1px solid ${statusBg ? "#334155" : hov || active ? "#334155" : "transparent"}`,
        borderLeft: `3px solid ${s.dot}`,
        borderRadius: 6,
        transition: "all .12s",
        opacity: f.status === "rejected" ? 0.55 : 1,
      }}
    >
      <button
        onClick={() => onSelect(f)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "inherit",
        }}
      >
        <div className="flex items-start gap-1.5" style={{ marginBottom: 2 }}>
          <div
            style={{
              fontSize: 12,
              color: "#e2e8f0",
              fontWeight: 500,
              lineHeight: 1.35,
              flex: 1,
              textDecoration: f.status === "rejected" ? "line-through" : "none",
            }}
          >
            {f.title}
          </div>
          {f.origin === "scan" && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                padding: "1px 4px",
                borderRadius: 3,
                background: "#3f1d38",
                color: "#f0abfc",
                letterSpacing: "0.05em",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              SCAN
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5" style={{ marginTop: 3 }}>
          <span style={{ fontSize: 10, color: "#475569" }}>{f.src}</span>
          <span style={{ color: "#334155" }}>·</span>
          <span
            className="font-mono-dm"
            style={{ fontSize: 10, color: confColor, fontWeight: 600 }}
          >
            {conf}% conf
          </span>
          {f.status && (
            <>
              <span style={{ color: "#334155" }}>·</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color:
                    f.status === "validated"
                      ? "#86efac"
                      : f.status === "rejected"
                      ? "#a1a1aa"
                      : "#fdba74",
                }}
              >
                {f.status === "validated"
                  ? "✓ Validated"
                  : f.status === "rejected"
                  ? "✗ Rejected"
                  : "⚠ Needs review"}
              </span>
            </>
          )}
        </div>
        {(hov || active) && (
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 5, lineHeight: 1.5 }}>
            {f.detail}
          </div>
        )}
        {f.note && !noteMode && (
          <div
            style={{
              fontSize: 10,
              color: "#cbd5e1",
              marginTop: 5,
              padding: "4px 6px",
              background: "rgba(59,130,246,.08)",
              borderLeft: "2px solid #3b82f6",
              borderRadius: 2,
              fontStyle: "italic",
            }}
          >
            {f.note}
          </div>
        )}
      </button>
      {showActions && (
        <div
          className="flex gap-1"
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid #1e293b",
          }}
        >
          {!noteMode ? (
            <>
              <ActionBtn
                label="✓ Validate"
                active={f.status === "validated"}
                activeBg="#14532d"
                activeFg="#86efac"
                onClick={() => onStatus(f.id, f.status === "validated" ? null : "validated")}
              />
              <ActionBtn
                label="⚠ Review"
                active={f.status === "review"}
                activeBg="#422006"
                activeFg="#fdba74"
                onClick={() => onStatus(f.id, f.status === "review" ? null : "review")}
              />
              <ActionBtn
                label="✗ Reject"
                active={f.status === "rejected"}
                activeBg="#3f3f46"
                activeFg="#d4d4d8"
                onClick={() => onStatus(f.id, f.status === "rejected" ? null : "rejected")}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNoteMode(true);
                }}
                title="Add note"
                style={{
                  padding: "3px 7px",
                  fontSize: 10,
                  fontWeight: 600,
                  background: "#0f172a",
                  color: "#64748b",
                  border: "1px solid #1e293b",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                ✎
              </button>
            </>
          ) : (
            <div className="flex-1 flex gap-1">
              <input
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onNote(f.id, noteDraft || null);
                    setNoteMode(false);
                  }
                  if (e.key === "Escape") {
                    setNoteMode(false);
                    setNoteDraft(f.note || "");
                  }
                }}
                placeholder="Add analyst note..."
                style={{
                  flex: 1,
                  padding: "3px 6px",
                  fontSize: 11,
                  background: "#020617",
                  color: "#e2e8f0",
                  border: "1px solid #334155",
                  borderRadius: 4,
                  outline: "none",
                }}
              />
              <button
                onClick={() => {
                  onNote(f.id, noteDraft || null);
                  setNoteMode(false);
                }}
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  active,
  activeBg,
  activeFg,
  onClick,
}: {
  label: string;
  active: boolean;
  activeBg: string;
  activeFg: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        flex: 1,
        padding: "3px 0",
        fontSize: 10,
        fontWeight: 600,
        background: active ? activeBg : "#0f172a",
        color: active ? activeFg : "#64748b",
        border: "1px solid #1e293b",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
