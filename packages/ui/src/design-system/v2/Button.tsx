"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type V2ButtonSize = "sm" | "md" | "lg";

const sizeClass: Record<V2ButtonSize, string> = {
  sm: styles.buttonSm,
  md: styles.buttonMd,
  lg: styles.buttonLg,
};

const variantClass: Record<V2ButtonVariant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  ghost: styles.buttonGhost,
  destructive: styles.buttonDestructive,
};

export interface V2ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: V2ButtonVariant;
  size?: V2ButtonSize;
  selected?: boolean;
  loading?: boolean;
}

export const V2Button = forwardRef<HTMLButtonElement, V2ButtonProps>(
  ({ className, variant = "primary", size = "md", selected, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type={props.type ?? "button"}
      className={cn(styles.buttonBase, sizeClass[size], variantClass[variant], className)}
      aria-pressed={selected || undefined}
      data-selected={selected ? "true" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className={styles.buttonLoading}>
          <span className={styles.spinner} aria-hidden />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  ),
);
V2Button.displayName = "V2Button";

/** Icon-only trigger — shares Button geometry (32/40) and focus treatment. Requires aria-label. */
export type V2IconButtonSize = "sm" | "md";
const iconSizeClass: Record<V2IconButtonSize, string> = {
  sm: styles.iconButtonSm,
  md: styles.iconButtonMd,
};

export interface V2IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: V2IconButtonSize;
  variant?: "default" | "ghost" | "destructive";
  label: string;
  selected?: boolean;
}

export const V2IconButton = forwardRef<HTMLButtonElement, V2IconButtonProps>(
  ({ className, size = "md", variant = "default", label, selected, ...props }, ref) => (
    <button
      ref={ref}
      type={props.type ?? "button"}
      aria-label={label}
      aria-pressed={selected || undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(styles.iconButtonBase, iconSizeClass[size], variant === "ghost" ? styles.iconButtonGhost : variant === "destructive" ? styles.iconButtonDestructive : styles.iconButtonDefault, className)}
      {...props}
    />
  ),
);
V2IconButton.displayName = "V2IconButton";