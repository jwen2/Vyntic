import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost" | "ink";
type Size = "default" | "compact" | "field";

interface LandingButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
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
  ink:
    "bg-[var(--landing-text)] text-[var(--landing-bg)] border-[var(--landing-text)] hover:opacity-90",
};

const SHARED_CLASSES =
  "inline-flex items-center justify-center border text-center font-medium transition-colors";

const SIZE_CLASSES: Record<Size, string> = {
  default: "min-h-11 rounded-full px-5 py-3 text-sm",
  compact: "min-h-9 rounded-[9px] px-[15px] py-2 text-[13px]",
  // Pairs with LandingInput's `field` size — same padding-y, border and font
  // size so the two sit flush in an inline form row.
  field: "rounded-[9px] px-[18px] py-[11px] text-[13px]",
};

export default function LandingButton({
  children,
  variant = "primary",
  size = "default",
  href,
  to,
  className = "",
  onClick,
  type = "button",
  disabled = false,
}: LandingButtonProps) {
  const classes = `${SHARED_CLASSES} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${
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
