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
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] hover:bg-[var(--accent-strong)]",
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
  type = "button",
  disabled = false,
}: LandingButtonProps) {
  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${
    disabled ? "cursor-not-allowed opacity-60" : ""
  } ${className}`.trim();

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
    <button type={type} onClick={onClick} className={classes} disabled={disabled}>
      {children}
    </button>
  );
}
