"use client";
import { ACCENT } from "@/components/dd/types";
import type { User } from "@/lib/api";

interface Props {
  user: User | null;
  dealCount: number;
  documentTotal: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onAddDeal?: () => void;
  onLogout: () => void;
}

export default function HomeTopBar({
  user,
  dealCount,
  documentTotal,
  theme,
  onToggleTheme,
  onAddDeal,
  onLogout,
}: Props) {
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
      <div className="flex items-center gap-2 mr-1">
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
        <span style={{ color: "white", fontWeight: 600, fontSize: 14 }}>
          Vyntic
        </span>
      </div>

      {/* Breadcrumb */}
      <span style={{ color: "#334155", fontSize: 13 }}>›</span>
      <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
        Deals
      </span>

      <div style={{ flex: 1 }} />

      {/* Stats */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: "#475569" }}>Active deals</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
          {dealCount}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: "#475569" }}>Documents</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
          {documentTotal}
        </div>
      </div>

      <div style={{ width: 1, height: 20, background: "#1e293b" }} />

      {/* User chip */}
      {user && (
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "4px 10px",
            background: "#1e293b",
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {user.full_name || user.email}
          </span>
          {user.is_admin && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 3,
                background: "#581c87",
                color: "#e9d5ff",
                letterSpacing: "0.05em",
              }}
            >
              ADMIN
            </span>
          )}
        </div>
      )}

      <IconButton
        title={theme === "dark" ? "Light mode" : "Dark mode"}
        onClick={onToggleTheme}
      >
        {theme === "dark" ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </IconButton>

      {onAddDeal && (
        <button
          onClick={onAddDeal}
          style={{
            padding: "6px 14px",
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
          + Add Deal
        </button>
      )}

      <button
        onClick={onLogout}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#e2e8f0";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#64748b";
        }}
        style={{
          padding: "6px 10px",
          background: "transparent",
          color: "#64748b",
          fontSize: 12,
          fontWeight: 500,
          border: "none",
          cursor: "pointer",
        }}
      >
        Logout
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
