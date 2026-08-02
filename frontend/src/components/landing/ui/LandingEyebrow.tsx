import type { ReactNode } from "react";

type Tone = "default" | "inverse";

// A `text-*` class passed via className competes with the base colour and the
// project has no tailwind-merge, so the winner comes down to stylesheet order.
// Tone is a real prop for that reason — callers on the inverse band must not
// hand-roll it.
const TONE_CLASSES: Record<Tone, string> = {
  default: "text-[var(--landing-muted)]",
  // 5.2:1 on --landing-inverse (#16202e).
  inverse: "text-[var(--landing-inverse-text)] opacity-[0.55]",
};

export default function LandingEyebrow({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <p
      className={`font-mono-plex text-[11px] font-medium uppercase tracking-[0.24em] ${TONE_CLASSES[tone]} ${className}`.trim()}
    >
      {children}
    </p>
  );
}
