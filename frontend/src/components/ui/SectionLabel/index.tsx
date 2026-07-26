import type { ComponentPropsWithoutRef } from "react";

export type SectionLabelVariant = "default" | "mono";

interface SectionLabelOwnProps {
  /**
   * `mono` is the monospaced, wider-tracked treatment used by the monitoring
   * screens. It is a deliberate second look, not drift — keep both.
   */
  variant?: SectionLabelVariant;
}

export type SectionLabelProps = SectionLabelOwnProps &
  Omit<ComponentPropsWithoutRef<"div">, keyof SectionLabelOwnProps>;

const VARIANT_CLASS: Record<SectionLabelVariant, string> = {
  default: "text-[10px] font-bold uppercase tracking-[0.08em] text-t3",
  mono: "font-mono-plex text-[10px] uppercase tracking-[0.14em] text-t3",
};

/**
 * Small uppercase heading that labels a section of a panel.
 *
 * Colour comes from the `text-t3` token, so it themes with the `.dark` class
 * and takes no `theme` prop (same contract as `Button`/`Modal`).
 *
 * Deliberately carries **no margin**: call sites previously used 8px, 10px, or
 * none, and that spacing belongs to the surrounding layout rather than to the
 * label. Pass it through `className` (e.g. `className="mb-2"`).
 */
export default function SectionLabel({
  variant = "default",
  className,
  children,
  ...rest
}: SectionLabelProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
