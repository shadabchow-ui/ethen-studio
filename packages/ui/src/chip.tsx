import * as React from "react";
import { cn } from "./lib/utils";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "muted";
}

const chipVariants = {
  default: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  outline: "border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)]",
  muted: "bg-[var(--bg-inset)] text-[var(--text-tertiary)]",
};

export function Chip({ variant = "default", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-medium",
        chipVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
