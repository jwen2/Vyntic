import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

type FieldSize = "sm" | "md" | "lg";

interface FieldOwnProps {
  fieldSize?: FieldSize;
  invalid?: boolean;
  fullWidth?: boolean;
}

interface InputOwnProps extends FieldOwnProps {
  iconLeft?: ReactNode;
  actionRight?: ReactNode;
  inputClassName?: string;
}

export type InputProps = InputOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, keyof InputOwnProps>;

export type TextareaProps = FieldOwnProps &
  Omit<ComponentPropsWithoutRef<"textarea">, keyof FieldOwnProps>;

export type SelectProps = FieldOwnProps &
  Omit<ComponentPropsWithoutRef<"select">, keyof FieldOwnProps>;

function fieldClasses(
  base: string,
  {
    fieldSize = "md",
    invalid = false,
    fullWidth = false,
    className,
  }: FieldOwnProps & { className?: string },
) {
  return [
    base,
    `${base}--${fieldSize}`,
    invalid && `${base}--invalid`,
    fullWidth && `${base}--full`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    fieldSize = "md",
    invalid = false,
    fullWidth = false,
    iconLeft,
    actionRight,
    className,
    inputClassName,
    disabled,
    ...rest
  },
  ref,
) {
  const shellClass = fieldClasses("input-shell", {
    fieldSize,
    invalid,
    fullWidth,
    className,
  });
  const controlClass = ["input-control", inputClassName].filter(Boolean).join(" ");

  return (
    <span className={shellClass} data-disabled={disabled ? "true" : undefined}>
      {iconLeft && <span className="input-adornment input-adornment--left">{iconLeft}</span>}
      <input
        ref={ref}
        className={controlClass}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {actionRight && <span className="input-adornment input-adornment--right">{actionRight}</span>}
    </span>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { fieldSize = "md", invalid = false, fullWidth = false, className, disabled, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={fieldClasses("textarea-control", {
        fieldSize,
        invalid,
        fullWidth,
        className,
      })}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { fieldSize = "md", invalid = false, fullWidth = false, className, disabled, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={fieldClasses("select-control", {
        fieldSize,
        invalid,
        fullWidth,
        className,
      })}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Input;
