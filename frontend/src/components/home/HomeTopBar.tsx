import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@/lib/api";
import Button from "@/components/ui/Button";

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
  theme,
  onToggleTheme,
  onAddDeal,
  onOpenDeals,
  onOpenPortfolio,
  onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // App chrome, not the landing page — semantic tokens flip with .dark on
  // their own, same idiom as HomeSidebar/DealListItem (no isDark ternaries
  // needed here beyond the inverse "V" mark / ADMIN chip below).
  const surface = "var(--surface)";
  const border = "var(--border)";
  const text = "var(--text-1)";
  const muted = "var(--text-3)";
  const chip = "var(--surface-alt)";
  const chipBorder = "var(--border)";

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  return (
    <div
      className="flex flex-shrink-0 items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-5"
      style={{
        background: surface,
        borderBottomColor: border,
        backdropFilter: "blur(16px)",
        // Raise the top bar's stacking context above the main content so the
        // account dropdown overlays workspace buttons (which are position:
        // relative via .btn and would otherwise paint over it).
        position: "relative",
        zIndex: 50,
      }}
    >
      {onOpenDeals && (
        <button
          type="button"
          onClick={onOpenDeals}
          className="flex h-9 w-9 items-center justify-center rounded-lg border lg:hidden"
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
            // Reserved "ink" badge tone — the app's existing inverse-chip
            // idiom (dark chip w/ light text in light mode, flips in dark).
            background: "var(--b-ink-bg)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--b-ink-fg)",
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
            Workspace
          </div>
        </div>
      </div>

      <span style={{ color: muted, fontSize: 13 }}>›</span>
      <span style={{ color: muted, fontSize: 13, fontWeight: 500 }}>
        Deals
      </span>

      <div style={{ flex: 1 }} />

      {onOpenPortfolio && (
        <div className="hidden sm:block" style={{ marginLeft: 4 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenPortfolio}
            className="font-mono-plex"
            style={{ textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 10 }}
          >
            Portfolio
          </Button>
        </div>
      )}

      {onAddDeal && (
        <div className="hidden sm:block" style={{ marginLeft: 4 }}>
          <Button variant="primary" onClick={onAddDeal}>
            Add deal
          </Button>
        </div>
      )}

      <div ref={menuRef} style={{ position: "relative" }}>
        <Button
          variant="secondary"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          style={{ height: 36 }}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {user?.full_name || user?.email || "Account"}
          </span>
          {user?.is_admin && (
            <span
              className="font-mono-plex hidden sm:inline"
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 5px",
                borderRadius: 5,
                background: "var(--b-ink-bg)",
                color: "var(--b-ink-fg)",
                letterSpacing: "0.08em",
              }}
            >
              ADMIN
            </span>
          )}
          <span style={{ color: muted, fontSize: 12 }}>▾</span>
        </Button>

        {menuOpen && (
          <div
            role="menu"
            className="border"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 220,
              padding: 6,
              background: surface,
              borderColor: chipBorder,
              borderRadius: 10,
              boxShadow: "0 18px 44px rgba(0,0,0,0.14)",
              zIndex: 60,
            }}
          >
            {user?.email && (
              <div
                style={{
                  padding: "8px 10px 10px",
                  borderBottom: `1px solid ${chipBorder}`,
                  marginBottom: 4,
                }}
              >
                <div style={{ color: text, fontSize: 13, fontWeight: 600 }}>
                  {user.full_name || "Admin"}
                </div>
                <div style={{ color: muted, fontSize: 12, marginTop: 2 }}>
                  {user.email}
                </div>
              </div>
            )}
            <MenuButton
              label={theme === "dark" ? "Light mode" : "Dark mode"}
              text={text}
              icon={
                theme === "dark" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )
              }
              onClick={() => {
                onToggleTheme();
                setMenuOpen(false);
              }}
            />
            <MenuButton
              label="Sign out"
              text={text}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
              }
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuButton({
  label,
  onClick,
  text,
  icon,
}: {
  label: string;
  onClick: () => void;
  text: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 10px",
        background: "transparent",
        color: text,
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        textAlign: "left",
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-tint)";
        e.currentTarget.style.color = text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = text;
      }}
    >
      {icon}
      {label}
    </button>
  );
}
