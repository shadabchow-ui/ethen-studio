"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type StudioIconButtonState =
  | "default"
  | "selected"
  | "disabled"
  | "loading"
  | "error";

interface StudioIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  state?: StudioIconButtonState;
  size?: "sm" | "md";
}

export const StudioIconButton = React.forwardRef<HTMLButtonElement, StudioIconButtonProps>(
  ({
    label,
    state = "default",
    size = "md",
    className,
    children,
    disabled,
    ...props
  }, ref) => {
    const isDisabled = disabled || state === "disabled";
    const isSelected = state === "selected";
    const isLoading = state === "loading";
    const isError = state === "error";

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-label={label}
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          "transition duration-100 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]",
          "active:scale-[0.93]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          size === "sm" ? "h-6 w-6 rounded-[5px] text-xs" : "h-8 w-8 rounded-[6px] text-sm",
          isSelected
            ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
            : "bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]",
          isError && "ring-2 ring-[var(--status-danger)]/40",
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
        ) : (
          children
        )}
      </button>
    );
  },
);
StudioIconButton.displayName = "StudioIconButton";
