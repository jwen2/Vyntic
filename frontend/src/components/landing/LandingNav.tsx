import { useState } from "react";
import { Link } from "react-router-dom";
import LandingContainer from "./ui/LandingContainer";
import LandingButton from "./ui/LandingButton";

const NAV_ITEMS = [
  { label: "Pilot", href: "#platform" },
  { label: "Workflow", href: "#product" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Controls", href: "#security" },
];

export default function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="landing-ivory sticky top-0 z-50 border-b border-[var(--landing-border)] bg-[rgba(244,241,234,0.92)] backdrop-blur">
      <div className="border-b border-[var(--landing-border)] bg-[var(--landing-inverse)] text-[var(--landing-inverse-text)]">
        <LandingContainer className="flex min-h-10 items-center justify-center py-2">
          <a
            href="#product"
            className="flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center"
          >
            <span className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-white/55">
              Pilot
            </span>
            <span className="min-w-0 break-words text-xs text-white/88 sm:text-sm">
              We are onboarding PE teams to test Vyntic on one diligence workflow.
            </span>
            <span className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-inverse-text)]">
              Learn more
            </span>
          </a>
        </LandingContainer>
      </div>

      <LandingContainer className="flex h-14 items-center justify-between sm:h-16">
        <div className="flex items-center gap-[36px]">
          <Link to="/" className="flex items-center gap-3">
            <span className="font-serif text-[24px] font-semibold tracking-[-0.01em] leading-none text-[var(--landing-text)]">
              Vyntic
            </span>
          </Link>

          <nav className="hidden items-center gap-[22px] lg:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-[13.5px] font-medium text-[var(--landing-text)] opacity-[0.78] transition-opacity hover:opacity-100"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <LandingButton variant="ghost" size="compact" to="/login">
            Sign in
          </LandingButton>
          {/* The demo is the strongest thing this page can offer, so it takes
              the primary slot. "Talk to us" keeps lead capture reachable —
              dropping it would trade a contact form for a demo click. */}
          <LandingButton variant="ghost" size="compact" href="#contact">
            Talk to us
          </LandingButton>
          <LandingButton variant="ink" size="compact" to="/demo">
            Try the demo
          </LandingButton>
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
                className="py-1 text-[13.5px] font-medium text-[var(--landing-text)] opacity-[0.78] transition-opacity hover:opacity-100"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="flex flex-col gap-3 pt-3">
              <LandingButton variant="secondary" to="/login">
                Sign in
              </LandingButton>
              <LandingButton to="/demo">Try the demo</LandingButton>
              <LandingButton variant="secondary" href="#contact">
                Talk to us
              </LandingButton>
            </div>
          </LandingContainer>
        </div>
      )}
    </header>
  );
}
