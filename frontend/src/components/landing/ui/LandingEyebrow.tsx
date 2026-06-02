import type { ReactNode } from "react";

export default function LandingEyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono-plex text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--landing-muted)] ${className}`.trim()}
    >
      {children}
    </p>
  );
}
