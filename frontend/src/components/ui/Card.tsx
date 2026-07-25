import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";

export type CardLevel = "hero" | "panel" | "inner";
export type CardTone = "surface" | "alt" | "alert";

interface CardOwnProps {
  /** Nesting depth — sets the radius and the default padding. */
  level: CardLevel;
  /** Surface treatment. `alert` is the critical wash used by deal-breaker stats. */
  tone?: CardTone;
  /** Dashed border (pre-run empty states). Colour is unchanged; only the style. */
  dashed?: boolean;
  /**
   * Escape hatch for the handful of sites whose padding is deliberate — the
   * financial table wrappers pass 0 and pad their own cells. Prefer the level
   * default. Never use a Tailwind padding utility here: card.css loads after
   * the utilities, so `.card--panel`'s padding would win.
   */
  padding?: number | string;
}

export type CardProps = CardOwnProps &
  Omit<ComponentPropsWithoutRef<"div">, keyof CardOwnProps>;

/**
 * Shared card primitive for the brief's nested panels. All colour comes from
 * CSS custom properties (see card.css / index.css), so it themes with the
 * `.dark` class and takes no `theme` prop — the same contract as <Button> and
 * <Modal>. See docs/superpowers/specs/2026-07-25-card-primitive-design.md.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { level, tone = "surface", dashed = false, padding, className, style, children, ...rest },
  ref
) {
  const classes = ["card", `card--${level}`, `card--${tone}`];
  if (dashed) classes.push("card--dashed");
  if (className) classes.push(className);

  // `style` spreads last so a caller can still win in a pinch.
  const merged: CSSProperties | undefined =
    padding === undefined ? style : { padding, ...style };

  return (
    <div ref={ref} className={classes.join(" ")} style={merged} {...rest}>
      {children}
    </div>
  );
});

export default Card;
