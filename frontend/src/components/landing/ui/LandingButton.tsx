import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost";

interface LandingButtonProps {
  children: ReactNode;
  variant?: Variant;
  href?: string;
  to?: string;
  className?: string;
  onClick?: () => void;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--landing-inverse)] text-[var(--landing-inverse-text)] border-[var(--landing-inverse)] hover:bg-black",
  secondary:
    "bg-[var(--landing-surface)] text-[var(--landing-text)] border-[var(--landing-border)] hover:bg-[var(--landing-surface-alt)]",
  ghost:
    "bg-transparent text-[var(--landing-text)] border-transparent hover:bg-black/5",
};

const BASE_CLASSES =
  "inline-flex min-h-11 items-center justify-center rounded-full border px-5 py-3 text-center text-sm font-medium transition-colors";

export default function LandingButton({
  children,
  variant = "primary",
  href,
  to,
  className = "",
  onClick,
}: LandingButtonProps) {
  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
