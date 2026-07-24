import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

export type ButtonVariant =
  | "primary"
  | "tint"
  | "secondary"
  | "subtle"
  | "danger";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonOwnProps {
  variant: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Square icon-only button. Requires a `title` or `aria-label` for its name. */
  iconOnly?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export type ButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonOwnProps>;

/**
 * Shared button primitive. All colour comes from CSS custom properties
 * (see button.css / index.css), so it themes with the `.dark` class and takes
 * no `theme` prop. See the finalized button-system artifact for the visual spec.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size = "md",
    iconLeft,
    iconRight,
    iconOnly = false,
    loading = false,
    fullWidth = false,
    className,
    children,
    disabled,
    onClick,
    ...rest
  },
  ref
) {
  const isDisabled = Boolean(disabled) || loading;

  const classes = [
    "btn",
    `btn--${variant}`,
    `btn--${size}`,
    iconOnly && "btn--icon",
    fullWidth && "btn--full",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Icon-only buttons must carry an accessible name. Warn in dev instead of
  // throwing so a missing label never breaks a render in production.
  if (import.meta.env.DEV && iconOnly) {
    const hasName = Boolean(
      rest["aria-label"] ?? rest["aria-labelledby"] ?? rest.title
    );
    if (!hasName) {
      // eslint-disable-next-line no-console
      console.warn(
        "Button: an `iconOnly` button needs a `title` or `aria-label` for accessibility."
      );
    }
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (isDisabled) return;
        onClick?.(event);
      }}
      {...rest}
    >
      {loading ? (
        <span className="btn__spin" aria-hidden="true" />
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export default Button;
