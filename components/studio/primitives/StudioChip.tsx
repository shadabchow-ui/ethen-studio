"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type StudioChipState =
  | "default"
  | "selected"
  | "disabled"
  | "loading"
  | "error";

export type StudioChipTone =
  | "default"
  | "primary"
  | "premium";

interface StudioChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state?: StudioChipState;
  tone?: StudioChipTone;
  size?: "sm" | "md";
}

const toneClasses: Record<StudioChipTone, Record<string, string>> = {
  default: {
    default: "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
    selected: "bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium",
  },
  primary: {
    default: "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
    selected: "bg-[var(--accent)] text-[var(--accent-fg)] font-medium",
  },
  premium: {
    default: "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
    selected: "bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium border border-[var(--border-default)]",
  },
};

export const StudioChip = React.forwardRef<HTMLButtonElement, StudioChipProps>(
  ({
    state = "default",
    tone = "default",
    size = "md",
    className,
    children,
    disabled,
    ...props
  }, ref) => {
    const isDisabled = disabled || state === "disabled";
    const isLoading = state === "loading";
    const isError = state === "error";
    const isSelected = state === "selected";

    const currentTone = toneClasses[tone];

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap select-none",
          "transition duration-100 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]",
          "active:scale-[0.96]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          size === "sm" ? "px-2 py-1 text-[10px] rounded-[6px]" : "px-3 py-1.5 text-[11.5px] rounded-[10px]",
          isSelected ? currentTone.selected : currentTone.default,
          isError && "ring-2 ring-[var(--status-danger)]/40",
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <svg
            className="h-3 w-3 animate-spin mr-1"
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
        ) : null}
        {children}
      </button>
    );
  },
);
StudioChip.displayName = "StudioChip";
