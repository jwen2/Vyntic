import { Link } from "react-router-dom";
import LandingContainer from "./ui/LandingContainer";

const FOOTER_LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "Product", href: "#product" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Security", href: "#security" },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-[var(--landing-border)] bg-[var(--landing-bg)]">
      <LandingContainer className="flex flex-col gap-8 py-8 sm:py-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--landing-inverse)] text-sm font-semibold text-white">
              V
            </div>
            <div className="text-sm font-semibold tracking-[-0.03em] text-[var(--landing-text)]">
              Vyntic
            </div>
          </Link>
          <p className="mt-4 text-sm leading-6 text-[var(--landing-muted)]">
            Document intelligence for private equity teams that need faster
            comparisons, reviewable outputs, and cleaner IC preparation.
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:items-end">
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-text)]"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/login"
              className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-text)]"
            >
              Sign in
            </Link>
          </div>
          <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
            © {new Date().getFullYear()} Vyntic
          </div>
        </div>
      </LandingContainer>
    </footer>
  );
}
