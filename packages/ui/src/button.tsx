import * as React from "react";
import { cn } from "./lib/utils";
import v2 from "./design-system/v2/v2.module.css";

const variantClasses = {
  default: v2.buttonPrimary,
  secondary: v2.buttonSecondary,
  ghost: v2.buttonGhost,
  outline: v2.buttonSecondary,
  destructive: v2.buttonDestructive,
  icon: v2.iconButtonBase,
  solidWhite: "ethen-primary-button font-medium",
  liquidWhite: "ethen-liquid-white-button font-medium",
  darkRect: "ethen-secondary-button font-medium",
} as const;

const RECTANGULAR_BUTTON_VARIANTS = new Set(["solidWhite", "liquidWhite", "darkRect"]);

const sizeClasses = {
  sm: v2.buttonSm,
  md: v2.buttonMd,
  lg: v2.buttonLg,
  icon: v2.iconButtonMd,
} as const;

const rectangularSizeClasses = {
  sm: "h-9 px-3.5 text-[13px] rounded-[8px]",
  md: "h-9 px-3.5 text-[13px] rounded-[8px]",
  lg: "h-10 px-4 text-[13px] rounded-[10px]",
  icon: "h-9 w-9 rounded-[8px]",
} as const;

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export interface ButtonVariantsOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function buttonVariants({
  variant = "default",
  size = "md",
  className,
}: ButtonVariantsOptions = {}) {
  const usesRectangularSystem = RECTANGULAR_BUTTON_VARIANTS.has(variant);

  return cn(
    usesRectangularSystem
      ? "inline-flex min-h-[var(--console-touch-target)] items-center justify-center ethen-interactive ethen-pressable ethen-focus-ring disabled:cursor-not-allowed disabled:opacity-45"
      : cn(v2.buttonBase, "disabled:cursor-not-allowed"),
    variantClasses[variant],
    usesRectangularSystem ? rectangularSizeClasses[size] : sizeClasses[size],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "md", isLoading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <span className={v2.buttonLoading}>
          <span className={v2.spinner} aria-hidden />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  ),
);
Button.displayName = "Button";
