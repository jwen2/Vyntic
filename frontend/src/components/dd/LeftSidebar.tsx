"use client";
import type { Finding, FindingStatus, DocCoverage } from "./types";
import FlagItem from "./FlagItem";

type LeftTab = "flags" | "docs";

interface Props {
  tab: LeftTab;
  onTab: (t: LeftTab) => void;
  findings: Finding[];
  docs: DocCoverage[];
  activeWs: string;
  onSelectFinding: (f: Finding) => void;
  onStatus: (id: string, status: FindingStatus) => void;
  onNote: (id: string, note: string | null) => void;
}

export default function LeftSidebar({
  tab,
  onTab,
  findings,
  docs,
  activeWs,
  onSelectFinding,
  onStatus,
  onNote,
}: Props) {
  const db = findings.filter((f) => f.sev === "deal-breaker");
  const mat = findings.filter((f) => f.sev === "material");
  const nw = findings.filter((f) => f.sev === "noteworthy");

  return (
    <div
      className="flex flex-col dd-scroll"
      style={{
        width: 272,
        flexShrink: 0,
        background: "#0f172a",
        borderRight: "1px solid #1e293b",
        overflow: "hidden",
      }}
    >
      {/* Tabs */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: "1px solid #1e293b" }}
      >
        <TabButton
          active={tab === "flags"}
          onClick={() => onTab("flags")}
          label="Red Flags"
          count={findings.length}
        />
        <TabButton
          active={tab === "docs"}
          onClick={() => onTab("docs")}
          label="Coverage"
        />
      </div>

      <div className="flex-1 overflow-y-auto dd-scroll">
        {tab === "flags" ? (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
            {findings.length === 0 && (
              <div style={{ padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                  No findings yet
                </div>
                <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5 }}>
                  Press <kbd className="font-mono-dm" style={{ fontSize: 10, padding: "1px 4px", background: "#1e293b", borderRadius: 3 }}>⌘K</kbd> to ask the agent to surface red flags.
                </div>
              </div>
            )}
            <Group
              severity="deal-breaker"
              label="Deal-Breakers"
              dot="#ef4444"
              textColor="#fca5a5"
              items={db}
              activeWs={activeWs}
              onSelect={onSelectFinding}
              onStatus={onStatus}
              onNote={onNote}
            />
            <Group
              severity="material"
              label="Material"
              dot="#f59e0b"
              textColor="#fde68a"
              items={mat}
              activeWs={activeWs}
              onSelect={onSelectFinding}
              onStatus={onStatus}
              onNote={onNote}
            />
            <Group
              severity="noteworthy"
              label="Noteworthy"
              dot="#60a5fa"
              textColor="#93c5fd"
              items={nw}
              activeWs={activeWs}
              onSelect={onSelectFinding}
              onStatus={onStatus}
              onNote={onNote}
            />
          </div>
        ) : (
          <DocsCoverage docs={docs} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5"
      style={{
        flex: 1,
        padding: "9px 6px",
        fontSize: 12,
        fontWeight: 600,
        color: active ? "#f1f5f9" : "#475569",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            padding: "1px 5px",
            borderRadius: 99,
            background: active ? "#dc2626" : "#1e293b",
            color: active ? "white" : "#64748b",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Group({
  severity,
  label,
  dot,
  textColor,
  items,
  activeWs,
  onSelect,
  onStatus,
  onNote,
}: {
  severity: string;
  label: string;
  dot: string;
  textColor: string;
  items: Finding[];
  activeWs: string;
  onSelect: (f: Finding) => void;
  onStatus: (id: string, status: FindingStatus) => void;
  onNote: (id: string, note: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5" style={{ marginBottom: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: textColor,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: "#334155", fontWeight: 600 }}>{items.length}</span>
      </div>
      {items.map((f) => (
        <FlagItem
          key={f.id}
          f={f}
          active={f.ws === activeWs}
          onSelect={onSelect}
          onStatus={onStatus}
          onNote={onNote}
        />
      ))}
    </div>
  );
}

function DocsCoverage({ docs }: { docs: DocCoverage[] }) {
  const totalPg = docs.reduce((s, d) => s + d.pages, 0);
  const citedPg = docs.reduce((s, d) => s + d.cited, 0);
  const pct = totalPg > 0 ? Math.round((citedPg / totalPg) * 100) : 0;

  return (
    <div style={{ padding: 12 }}>
      {/* Overall */}
      <div style={{ padding: 10, background: "#1e293b", borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 5 }}>
          Deal room coverage
        </div>
        <div className="flex items-center gap-2">
          <div
            style={{
              flex: 1,
              height: 4,
              background: "#334155",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "#2563eb",
                borderRadius: 99,
              }}
            />
          </div>
          <span
            className="font-mono-dm"
            style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}
          >
            {pct}%
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>
          {citedPg} of {totalPg} pages cited
        </div>
      </div>

      {docs.length === 0 && (
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>No documents yet</div>
          <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5 }}>
            Upload CIMs, QoE reports, legal DD and financials to begin analysis.
          </div>
        </div>
      )}

      {docs.map((d) => {
        const p = d.pages > 0 ? Math.round((d.cited / d.pages) * 100) : 0;
        return (
          <div
            key={d.id}
            style={{
              padding: "8px 10px",
              marginBottom: 5,
              background: d.uncovered ? "rgba(127,29,29,.25)" : "#1e293b",
              border: `1px solid ${d.uncovered ? "#7f1d1d" : "#334155"}`,
              borderRadius: 6,
            }}
          >
            <div className="flex items-center gap-1.5" style={{ marginBottom: 5 }}>
              {d.uncovered && <span style={{ fontSize: 11 }}>⚠</span>}
              <span
                title={d.name}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: d.uncovered ? "#fca5a5" : "#e2e8f0",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d.short}
              </span>
              <span
                className="font-mono-dm"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: d.uncovered ? "#ef4444" : p > 50 ? "#22c55e" : "#f59e0b",
                }}
              >
                {p}%
              </span>
            </div>
            <div
              style={{
                height: 3,
                background: "#334155",
                borderRadius: 99,
                overflow: "hidden",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: `${p}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: d.uncovered ? "#ef4444" : p > 50 ? "#22c55e" : "#f59e0b",
                }}
              />
            </div>
            <div className="flex justify-between">
              <span style={{ fontSize: 10, color: "#475569" }}>
                {d.cited}/{d.pages} pgs
              </span>
              {d.uncovered && (
                <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>
                  NOT ANALYZED
                </span>
              )}
              {d.flags > 0 && (
                <span style={{ fontSize: 10, color: "#fca5a5", fontWeight: 600 }}>
                  {d.flags} flag{d.flags > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
