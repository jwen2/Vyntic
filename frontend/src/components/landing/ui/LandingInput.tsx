import type { InputHTMLAttributes } from "react";

type Size = "default" | "field";

// `size` is taken by the HTML attribute, so the geometry prop is `inputSize`.
interface LandingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: Size;
}

const SHARED_CLASSES =
  "w-full border border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-text)] outline-none transition-colors placeholder:text-[var(--landing-muted)] focus:border-[var(--landing-inverse)]";

const SIZE_CLASSES: Record<Size, string> = {
  default: "rounded-2xl px-4 py-3 text-sm",
  field: "rounded-[9px] px-[14px] py-[11px] text-[13px]",
};

export default function LandingInput({
  className = "",
  inputSize = "default",
  ...props
}: LandingInputProps) {
  return (
    <input
      {...props}
      className={`${SHARED_CLASSES} ${SIZE_CLASSES[inputSize]} ${className}`.trim()}
    />
  );
}
