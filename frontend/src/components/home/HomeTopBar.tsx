import type { User } from "@/lib/api";

interface Props {
  user: User | null;
  dealCount: number;
  documentTotal: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onAddDeal?: () => void;
  onOpenDeals?: () => void;
  onOpenPortfolio?: () => void;
  onLogout: () => void;
}

export default function HomeTopBar({
  user,
  dealCount,
  documentTotal,
  theme,
  onToggleTheme,
  onAddDeal,
  onOpenDeals,
  onOpenPortfolio,
  onLogout,
}: Props) {
  const isDark = theme === "dark";
  const surface = isDark ? "#111111" : "rgba(243,243,238,0.94)";
  const border = isDark ? "#242424" : "var(--landing-border)";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
  const muted = isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)";
  const chip = isDark ? "#1a1a1a" : "rgba(255,255,255,0.72)";
  const chipBorder = isDark ? "#2d2d2d" : "var(--landing-border)";

  return (
    <div
      className="flex flex-shrink-0 items-center gap-2 border-b px-3 py-3 sm:gap-3 sm:px-5"
      style={{
        background: surface,
        borderBottomColor: border,
        backdropFilter: "blur(16px)",
      }}
    >
      {onOpenDeals && (
        <button
          type="button"
          onClick={onOpenDeals}
          className="flex h-10 w-10 items-center justify-center rounded-full border lg:hidden"
          style={{
            borderColor: chipBorder,
            background: chip,
            color: text,
          }}
          aria-label="Open deals"
        >
          ≡
        </button>
      )}

      <div className="flex items-center gap-3">
        <div
          style={{
            width: 34,
            height: 34,
            background: isDark ? "#f5f5f5" : "#111111",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            color: isDark ? "#111111" : "#ffffff",
          }}
        >
          V
        </div>
        <div>
          <div style={{ color: text, fontWeight: 600, fontSize: 14 }}>Vyntic</div>
          <div
            className="font-mono-plex"
            style={{
              color: muted,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            App workspace
          </div>
        </div>
      </div>

      <span style={{ color: muted, fontSize: 13 }}>›</span>
      <span style={{ color: muted, fontSize: 13, fontWeight: 500 }}>
        Deals
      </span>

      <div style={{ flex: 1 }} />

      <div className="hidden items-center gap-2 sm:flex">
        <StatPill label="Deals" value={dealCount} muted={muted} chip={chip} chipBorder={chipBorder} />
        <StatPill
          label="Documents"
          value={documentTotal}
          muted={muted}
          chip={chip}
          chipBorder={chipBorder}
        />
      </div>

      {user && (
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: "7px 12px",
            background: chip,
            borderRadius: 999,
            border: `1px solid ${chipBorder}`,
          }}
        >
          <span style={{ fontSize: 11, color: muted }}>
            {user.full_name || user.email}
          </span>
          {user.is_admin && (
            <span
              className="font-mono-plex"
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 999,
                background: isDark ? "#f5f5f5" : "#111111",
                color: isDark ? "#111111" : "#ffffff",
                letterSpacing: "0.12em",
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
        theme={theme}
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

      {onOpenPortfolio && (
        <button
          onClick={onOpenPortfolio}
          className="font-mono-plex hidden text-[10px] uppercase tracking-[0.18em] sm:block"
          style={{
            padding: "8px 14px",
            background: chip,
            color: text,
            border: `1px solid ${chipBorder}`,
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          Portfolio
        </button>
      )}

      {onAddDeal && (
        <button
          onClick={onAddDeal}
          className="hidden sm:block"
          style={{
            padding: "10px 16px",
            background: "var(--accent)",
            color: "var(--on-accent)",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          Add deal
        </button>
      )}

      <button
        onClick={onLogout}
        className="font-mono-plex hidden text-[10px] uppercase tracking-[0.18em] sm:block"
        style={{
          padding: "6px 10px",
          background: "transparent",
          color: muted,
          fontSize: 10,
          fontWeight: 500,
          border: "none",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  theme,
  children,
}: {
  title: string;
  onClick: () => void;
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const isDark = theme === "dark";
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark ? "#1a1a1a" : "rgba(255,255,255,0.72)",
        color: isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)",
        border: `1px solid ${isDark ? "#2d2d2d" : "var(--landing-border)"}`,
        borderRadius: 999,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function StatPill({
  label,
  value,
  muted,
  chip,
  chipBorder,
}: {
  label: string;
  value: number;
  muted: string;
  chip: string;
  chipBorder: string;
}) {
  return (
    <div
      style={{
        padding: "7px 12px",
        background: chip,
        borderRadius: 999,
        border: `1px solid ${chipBorder}`,
      }}
    >
      <div
        className="font-mono-plex"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: muted,
        }}
      >
        {label}
      </div>
      {/* Accent numeral: #1d4ed8 ≥ 6.5:1 on the light chip, #8ab4ff ≥ 8.4:1 on the dark one. */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{value}</div>
    </div>
  );
}
