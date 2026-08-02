import { Link } from "react-router-dom";
import LandingContainer from "./ui/LandingContainer";

const FOOTER_LINKS = [
  { label: "Pilot", href: "#platform" },
  { label: "Workflow", href: "#product" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Controls", href: "#security" },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-[var(--landing-border)] bg-[var(--landing-bg)]">
      <LandingContainer className="flex flex-col gap-8 py-8 sm:py-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-md">
          {/* Bare Playfair wordmark, matching the header — the "V" badge was
              dropped there in the same pass. */}
          <Link to="/" className="flex items-center gap-3">
            <span className="font-serif text-[20px] font-semibold leading-none tracking-[-0.01em] text-[var(--landing-text)]">
              Vyntic
            </span>
          </Link>
          <p className="mt-4 text-sm leading-6 text-[var(--landing-muted)]">
            An AI diligence workspace for private equity teams piloting faster,
            cited review across one real deal workflow.
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
