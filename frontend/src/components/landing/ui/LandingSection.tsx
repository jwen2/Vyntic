import type { ReactNode } from "react";
import LandingContainer from "./LandingContainer";

type Tone = "default" | "muted" | "inverse";

interface LandingSectionProps {
  children: ReactNode;
  id?: string;
  className?: string;
  containerClassName?: string;
  tone?: Tone;
}

const TONE_CLASSES: Record<Tone, string> = {
  default: "bg-transparent text-[var(--landing-text)]",
  muted: "bg-[var(--landing-surface-alt)] text-[var(--landing-text)]",
  inverse: "bg-[var(--landing-inverse)] text-[var(--landing-inverse-text)]",
};

export default function LandingSection({
  children,
  id,
  className = "",
  containerClassName = "",
  tone = "default",
}: LandingSectionProps) {
  return (
    <section
      id={id}
      className={`${TONE_CLASSES[tone]} py-14 sm:py-16 lg:py-28 ${className}`.trim()}
    >
      <LandingContainer className={containerClassName}>{children}</LandingContainer>
    </section>
  );
}
