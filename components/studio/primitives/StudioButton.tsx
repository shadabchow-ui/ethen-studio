"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const variantClasses = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[var(--status-danger)]/10 text-[var(--status-danger)] hover:bg-[var(--status-danger)]/15",
  premium:
    "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-inset)] hover:border-[var(--border-default)]",
};

const sizeClasses = {
  xs: "px-2 py-1 text-[10px] rounded-[6px]",
  sm: "px-3 py-1.5 text-[11.5px] rounded-[9px]",
  md: "px-4 py-2.5 text-[12.5px] rounded-[10px]",
  lg: "px-5 py-3 text-[14px] rounded-[12px]",
};

export type StudioButtonVariant = keyof typeof variantClasses;
export type StudioButtonSize = keyof typeof sizeClasses;

export type StudioButtonState =
  | "default"
  | "loading"
  | "disabled"
  | "error"
  | "success";

interface StudioButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: StudioButtonVariant;
  size?: StudioButtonSize;
  state?: StudioButtonState;
  icon?: React.ReactNode;
  loadingLabel?: string;
}

export const StudioButton = React.forwardRef<HTMLButtonElement, StudioButtonProps>(
  ({
    variant = "secondary",
    size = "md",
    state = "default",
    icon,
    loadingLabel = "Loading…",
    className,
    children,
    disabled,
    ...props
  }, ref) => {
    const isDisabled = disabled || state === "disabled" || state === "loading";
    const isError = state === "error";
    const isLoading = state === "loading";
    const isSuccess = state === "success";

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-medium select-none",
          "transition duration-100 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]",
          "active:scale-[0.97]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          variantClasses[variant],
          sizeClasses[size],
          isLoading && "cursor-wait",
          isError && "ring-2 ring-[var(--status-danger)]/40",
          isSuccess && "ring-2 ring-[var(--status-success)]/30",
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <circle
              cx="10" cy="10" r="8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeDasharray="30 14"
              strokeLinecap="round"
            />
          </svg>
        ) : icon ? (
          <span className="h-3.5 w-3.5 shrink-0">{icon}</span>
        ) : null}
        {isLoading ? loadingLabel : children}
      </button>
    );
  },
);
StudioButton.displayName = "StudioButton";
