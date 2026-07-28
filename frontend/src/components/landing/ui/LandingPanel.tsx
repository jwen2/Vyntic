import type { ReactNode } from "react";

type Variant = "default" | "muted" | "inverse";

interface LandingPanelProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  default:
    "border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-text)]",
  muted:
    "border-[var(--landing-border)] bg-[var(--landing-surface-alt)] text-[var(--landing-text)]",
  inverse: "border-white/10 bg-[var(--landing-inverse)] text-[var(--landing-inverse-text)]",
};

export default function LandingPanel({
  children,
  variant = "default",
  className = "",
}: LandingPanelProps) {
  return (
    <div
      className={`min-w-0 rounded-[1.5rem] border p-4 sm:rounded-[2rem] sm:p-6 ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
