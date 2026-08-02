import type { ReactNode } from "react";

type Variant = "default" | "muted" | "inverse";
type Radius = "panel" | "card";

interface LandingPanelProps {
  children: ReactNode;
  variant?: Variant;
  radius?: Radius;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  default:
    "border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-text)]",
  muted:
    "border-[var(--landing-border)] bg-[var(--landing-surface-alt)] text-[var(--landing-text)]",
  inverse: "border-white/10 bg-[var(--landing-inverse)] text-[var(--landing-inverse-text)]",
};

// "panel" is the original soft-cornered shell, kept for the hero preview and
// LoginPage. "card" is the Ivory mock's tighter 12px corner, used by the
// content cards below the fold.
const RADIUS_CLASSES: Record<Radius, string> = {
  panel: "rounded-[1.5rem] sm:rounded-[2rem]",
  card: "rounded-xl",
};

export default function LandingPanel({
  children,
  variant = "default",
  radius = "panel",
  className = "",
}: LandingPanelProps) {
  return (
    <div
      className={`min-w-0 border p-4 sm:p-6 ${RADIUS_CLASSES[radius]} ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
