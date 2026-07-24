import { useEffect, useRef, useState } from "react";
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
  const isDark = theme === "dark";
  const surface = isDark ? "#111111" : "rgba(243,243,238,0.94)";
  const border = isDark ? "#242424" : "var(--landing-border)";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
  const muted = isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)";
  const chip = isDark ? "#1a1a1a" : "rgba(255,255,255,0.72)";
  const chipBorder = isDark ? "#2d2d2d" : "var(--landing-border)";

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
            background: isDark ? "#f5f5f5" : "#111111",
            borderRadius: 8,
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
                background: isDark ? "#f5f5f5" : "#111111",
                color: isDark ? "#111111" : "#ffffff",
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
              background: isDark ? "#151515" : "#ffffff",
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
              onClick={() => {
                onToggleTheme();
                setMenuOpen(false);
              }}
            />
            <MenuButton
              label="Sign out"
              text={text}
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
}: {
  label: string;
  onClick: () => void;
  text: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        width: "100%",
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
      {label}
    </button>
  );
}
