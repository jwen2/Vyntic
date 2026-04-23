"use client";
import type { Deal } from "@/lib/api";
import { ACCENT } from "./types";

interface TopBarProps {
  deal: Deal;
  documentCount: number;
  coverage: number;
  dealBreakers: number;
  onAskAgent: () => void;
  onExport: () => void;
  onBack: () => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
  onUpload?: () => void;
  onHistory?: () => void;
  onMatrixView?: () => void;
  isAdmin?: boolean;
}

export default function TopBar({
  deal,
  documentCount,
  coverage,
  dealBreakers,
  onAskAgent,
  onExport,
  onBack,
  onToggleTheme,
  theme,
  onUpload,
  onHistory,
  onMatrixView,
  isAdmin,
}: TopBarProps) {
  return (
    <div
      className="flex items-center gap-3 px-5 flex-shrink-0"
      style={{
        background: "#0f172a",
        height: 52,
        borderBottom: "1px solid #1e293b",
      }}
    >
      {/* Logo */}
      <button
        onClick={onBack}
        title="Back to deals"
        className="flex items-center gap-2 mr-1"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: ACCENT,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 13,
            color: "white",
          }}
        >
          V
        </div>
        <span style={{ color: "white", fontWeight: 600, fontSize: 14 }}>Vyntic</span>
      </button>

      {/* Breadcrumb */}
      <span style={{ color: "#334155", fontSize: 13 }}>›</span>
      <button
        onClick={onBack}
        style={{
          color: "#475569",
          fontSize: 13,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        Deals
      </button>
      <span style={{ color: "#334155", fontSize: 13 }}>›</span>
      <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>{deal.name}</span>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "#1e293b", margin: "0 4px" }} />

      {/* Stage pill */}
      <span
        style={{
          fontSize: 11,
          padding: "3px 8px",
          borderRadius: 99,
          background: "#1e293b",
          color: "#64748b",
          border: "1px solid #334155",
        }}
      >
        {deal.stage}
      </span>

      <div style={{ flex: 1 }} />

      {/* Meta chips */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: "#475569" }}>Documents</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
          {documentCount} file{documentCount !== 1 ? "s" : ""}
        </div>
      </div>

      {deal.tags && deal.tags.length > 0 && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#475569" }}>Tags</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
            {deal.tags.slice(0, 2).join(" · ")}
          </div>
        </div>
      )}

      <div style={{ width: 1, height: 20, background: "#1e293b" }} />

      {/* Coverage chip */}
      <div
        className="flex items-center gap-1.5"
        style={{
          padding: "4px 10px",
          background: "#1e293b",
          borderRadius: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: coverage > 55 ? "#22c55e" : "#f59e0b",
          }}
        />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Coverage</span>
        <span
          className="font-mono-dm"
          style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}
        >
          {coverage}%
        </span>
      </div>

      {/* Deal-breaker chip */}
      {dealBreakers > 0 && (
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "4px 10px",
            background: "#450a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 6,
          }}
        >
          <span
            className="dd-pulse"
            style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }}
          />
          <span style={{ fontSize: 12, color: "#fca5a5", fontWeight: 700 }}>
            {dealBreakers} Deal-Breaker{dealBreakers > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Utility icons */}
      {isAdmin && onUpload && (
        <IconButton title="Upload documents" onClick={onUpload}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </IconButton>
      )}

      {onHistory && (
        <IconButton title="History" onClick={onHistory}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </IconButton>
      )}

      {onMatrixView && (
        <IconButton title="Matrix view" onClick={onMatrixView}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        </IconButton>
      )}

      <IconButton title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme}>
        {theme === "dark" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </IconButton>

      {/* Ask agent button */}
      <button
        onClick={onAskAgent}
        className="flex items-center gap-2"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#334155";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1e293b";
        }}
        style={{
          padding: "6px 12px 6px 10px",
          background: "#1e293b",
          color: "#e2e8f0",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          border: "1px solid #334155",
          cursor: "pointer",
          marginLeft: 4,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        Ask agent
        <kbd
          className="font-mono-dm"
          style={{
            fontSize: 10,
            padding: "1px 5px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 3,
            color: "#64748b",
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Export IC Report */}
      <button
        onClick={onExport}
        style={{
          padding: "6px 16px",
          background: ACCENT,
          color: "white",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          marginLeft: 4,
        }}
      >
        Export IC Report
      </button>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#1e293b";
        e.currentTarget.style.color = "#e2e8f0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#64748b";
      }}
      style={{
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: "#64748b",
        border: "none",
        borderRadius: 5,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
