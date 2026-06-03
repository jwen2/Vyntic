import { useState } from "react";
import { Link } from "react-router-dom";
import LandingContainer from "./ui/LandingContainer";
import LandingButton from "./ui/LandingButton";

const NAV_ITEMS = [
  { label: "Platform", href: "#platform" },
  { label: "Product", href: "#product" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Security", href: "#security" },
];

export default function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--landing-border)] bg-[rgba(243,243,238,0.92)] backdrop-blur">
      <div className="border-b border-[var(--landing-border)] bg-[var(--landing-inverse)] text-[var(--landing-inverse-text)]">
        <LandingContainer className="flex min-h-10 items-center justify-center py-2">
          <a
            href="#product"
            className="flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center"
          >
            <span className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
              New
            </span>
            <span className="text-xs text-white/88 sm:text-sm">
              Vyntic agents execute deal work with Gemini-powered reasoning.
            </span>
            <span className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white">
              Learn more
            </span>
          </a>
        </LandingContainer>
      </div>

      <LandingContainer className="flex h-14 items-center justify-between sm:h-16">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--landing-inverse)] text-sm font-semibold text-white sm:h-9 sm:w-9">
            V
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[-0.03em] text-[var(--landing-text)]">
              Vyntic
            </div>
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
              Deal Intelligence
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="font-mono-plex text-xs uppercase tracking-[0.18em] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-text)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LandingButton variant="ghost" to="/login">
            Sign in
          </LandingButton>
          <LandingButton href="#contact">Request a demo</LandingButton>
        </div>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--landing-border)] bg-white text-[var(--landing-text)] lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? "×" : "≡"}
        </button>
      </LandingContainer>

      {mobileOpen && (
        <div className="border-t border-[var(--landing-border)] bg-[var(--landing-bg)] lg:hidden">
          <LandingContainer className="flex flex-col gap-4 py-4">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="font-mono-plex py-1 text-xs uppercase tracking-[0.18em] text-[var(--landing-muted)]"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="flex flex-col gap-3 pt-3">
              <LandingButton variant="secondary" to="/login">
                Sign in
              </LandingButton>
              <LandingButton href="#contact">Request a demo</LandingButton>
            </div>
          </LandingContainer>
        </div>
      )}
    </header>
  );
}
