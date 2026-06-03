import type { ElementType, ReactNode } from "react";

type Tone = "default" | "muted" | "inverseMuted";

interface LandingTextProps {
  children: ReactNode;
  as?: ElementType;
  tone?: Tone;
  className?: string;
}

const TONE_CLASSES: Record<Tone, string> = {
  default: "text-[var(--landing-text)]",
  muted: "text-[var(--landing-muted)]",
  inverseMuted: "text-white/72",
};

export default function LandingText({
  children,
  as: Tag = "p",
  tone = "muted",
  className = "",
}: LandingTextProps) {
  return (
    <Tag
      className={`text-[15px] leading-7 sm:text-lg ${TONE_CLASSES[tone]} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
