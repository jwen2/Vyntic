import type { InputHTMLAttributes } from "react";

type LandingInputProps = InputHTMLAttributes<HTMLInputElement>;

export default function LandingInput({
  className = "",
  ...props
}: LandingInputProps) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-surface)] px-4 py-3 text-sm text-[var(--landing-text)] outline-none transition-colors placeholder:text-[var(--landing-muted)] focus:border-[var(--landing-inverse)] ${className}`.trim()}
    />
  );
}
