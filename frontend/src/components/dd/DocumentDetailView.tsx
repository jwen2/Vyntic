
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocCoverage, Finding, FindingSeverity } from "./types";
import { ACCENT, SEV_COLOR, ddTheme, tint } from "./types";

interface Props {
  doc: DocCoverage;
  findings: Finding[];
  theme: "light" | "dark";
  onBack: () => void;
  onSelectFinding: (finding: Finding) => void;
  onOpenSource: (finding: Finding) => void;
  onAsk: (prompt: string) => void;
}

const SEVERITY_ORDER: Array<{ sev: FindingSeverity; label: string }> = [
  { sev: "deal-breaker", label: "Deal-Breaker" },
  { sev: "material", label: "Material" },
  { sev: "noteworthy", label: "Noteworthy" },
];

const SUGGESTED_PROMPTS = [
  "Summarize the key risks raised in this document.",
  "List every numerical claim and flag any inconsistencies.",
  "Identify any commitments, obligations, or liabilities disclosed here.",
];

export default function DocumentDetailView({
  doc,
  findings,
  theme,
  onBack,
  onSelectFinding,
  onOpenSource,
  onAsk,
}: Props) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [doc.id]);

  const docFindings = useMemo(
    () =>
      findings.filter((f) => {
        if (f.sourceCitation?.source_file === doc.name) return true;
        return f.src.includes(doc.short);
      }),
    [findings, doc.name, doc.short]
  );

  const pct = doc.pages > 0 ? Math.round((doc.cited / doc.pages) * 100) : 0;
  const barColor = doc.uncovered ? "var(--status-critical)" : pct > 50 ? "var(--status-good)" : pct > 0 ? "var(--status-warning)" : c.border;

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setPrompt("");
  }

  return (
    <div className="dd-scroll" style={{ flex: 1, overflowY: "auto", background: c.bg }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 28px" }}>
        <button
          onClick={onBack}
          onMouseEnter={(e) => (e.currentTarget.style.color = c.t1)}
          onMouseLeave={(e) => (e.currentTarget.style.color = c.t2)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            color: c.t2,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All workstreams
        </button>

        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: c.t1, marginBottom: 4, lineHeight: 1.3, wordBreak: "break-word" }}>
            {doc.short}
          </h2>
          <div style={{ fontSize: 12, color: c.t3, marginBottom: 12 }}>{doc.name}</div>

          <div
            style={{
              padding: 14,
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: c.t3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
                Coverage
              </span>
              <span className="font-mono-dm" style={{ fontSize: 13, fontWeight: 700, color: c.t1 }}>{pct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: c.border, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99 }} />
            </div>
            <div className="flex items-center" style={{ gap: 12, fontSize: 11, color: c.t3 }}>
              <span className="font-mono-dm">{doc.cited} of {doc.pages} pages cited</span>
              <span className="font-mono-dm">{docFindings.length} flag{docFindings.length === 1 ? "" : "s"}</span>
              {doc.uncovered && (
                <span style={{ color: "var(--status-critical)", fontWeight: 700, letterSpacing: "0.04em" }}>NOT ANALYZED</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <SectionHeader theme={theme} label="Insights flagged on this document" count={docFindings.length} />
          {docFindings.length === 0 ? (
            <div
              style={{
                padding: "16px 14px",
                fontSize: 12,
                color: c.t3,
                lineHeight: 1.5,
                background: c.surface,
                border: `1px dashed ${c.border}`,
                borderRadius: 8,
              }}
            >
              No flagged insights tied to this document yet. Ask the agent below to analyze it.
            </div>
          ) : (
            SEVERITY_ORDER.map(({ sev, label }) => {
              const items = docFindings.filter((f) => f.sev === sev);
              if (items.length === 0) return null;
              const meta = SEV_COLOR[sev];
              const sevText = isDark ? meta.textDark : meta.color;
              return (
                <div key={sev} style={{ marginBottom: 14 }}>
                  <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: sevText, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: c.t3, fontWeight: 600 }}>{items.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        theme={theme}
                        onSelect={onSelectFinding}
                        onOpenSource={onOpenSource}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div>
          <SectionHeader theme={theme} label={`Ask the agent about ${doc.short}`} />
          <div
            style={{
              padding: 12,
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
            }}
          >
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={`Ask anything about ${doc.short}...`}
              rows={3}
              style={{
                width: "100%",
                padding: 10,
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                color: c.t1,
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
            <div className="flex items-center justify-between" style={{ marginTop: 10, gap: 10 }}>
              <span style={{ fontSize: 11, color: c.t3 }}>
                Agent will scope its analysis to this document.
              </span>
              <button
                onClick={submit}
                disabled={!prompt.trim()}
                style={{
                  padding: "7px 14px",
                  background: prompt.trim() ? ACCENT : c.border,
                  color: prompt.trim() ? "var(--on-accent)" : c.t3,
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: prompt.trim() ? "pointer" : "not-allowed",
                }}
              >
                Ask agent
              </button>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUGGESTED_PROMPTS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onAsk(suggestion)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = tint(ACCENT, 40);
                    e.currentTarget.style.color = c.t1;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = c.border;
                    e.currentTarget.style.color = c.t2;
                  }}
                  style={{
                    padding: "6px 10px",
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    borderRadius: 99,
                    fontSize: 11,
                    color: c.t2,
                    cursor: "pointer",
                    transition: "border-color .1s, color .1s",
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, count, theme }: { label: string; count?: number; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return (
    <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: c.t2, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
      {count != null && (
        <span style={{ fontSize: 10, fontWeight: 600, color: c.t3, padding: "1px 6px", background: c.surface, borderRadius: 99 }}>
          {count}
        </span>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  theme,
  onSelect,
  onOpenSource,
}: {
  finding: Finding;
  theme: "light" | "dark";
  onSelect: (f: Finding) => void;
  onOpenSource: (f: Finding) => void;
}) {
  const c = ddTheme(theme);
  const meta = SEV_COLOR[finding.sev];
  const isDealBreaker = finding.sev === "deal-breaker";
  const baseBg = isDealBreaker ? "var(--status-critical-tint)" : c.surface;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(finding)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(finding);
        }
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tint(ACCENT, 40);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isDealBreaker ? "var(--status-critical-tint-border)" : c.border;
      }}
      style={{
        padding: "10px 12px",
        background: baseBg,
        border: `1px solid ${isDealBreaker ? "var(--status-critical-tint-border)" : c.border}`,
        borderLeft: `3px solid ${meta.dot}`,
        borderRadius: 7,
        cursor: "pointer",
        transition: "border-color .1s",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: isDealBreaker ? "var(--status-critical)" : c.t1, lineHeight: 1.35, marginBottom: 4 }}>
        {finding.title}
      </div>
      {finding.detail && (
        <div style={{ fontSize: 12, color: isDealBreaker ? "var(--status-critical)" : c.t2, lineHeight: 1.45, marginBottom: 6 }}>
          {finding.detail}
        </div>
      )}
      <div
        role={finding.sourceCitation ? "button" : undefined}
        title={finding.sourceCitation ? "Open source evidence" : undefined}
        onClick={(e) => {
          if (!finding.sourceCitation) return;
          e.stopPropagation();
          onOpenSource(finding);
        }}
        style={{
          fontSize: 10,
          color: c.t3,
          textDecoration: finding.sourceCitation ? "underline" : "none",
          textUnderlineOffset: 2,
          cursor: finding.sourceCitation ? "pointer" : "inherit",
        }}
      >
        {finding.src}
      </div>
    </div>
  );
}
