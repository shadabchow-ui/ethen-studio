import * as React from "react";
import { cn } from "./lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  label: string;
  dot?: boolean;
}

const toneClasses: Record<StatusTone, string> = {
  neutral:
    "border-[var(--border-subtle)] text-[var(--text-tertiary)]",
  success:
    "border-[color-mix(in_srgb,var(--status-success)_30%,transparent)] text-[var(--status-success)]",
  warning:
    "border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] text-[var(--status-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--status-danger)_30%,transparent)] text-[var(--status-danger)]",
  info:
    "border-[var(--border-default)] text-[var(--text-secondary)]",
};

const dotColors: Record<StatusTone, string> = {
  neutral: "bg-[var(--text-tertiary)]",
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  danger:  "bg-[var(--status-danger)]",
  info:    "bg-[var(--text-secondary)]",
};

export function StatusBadge({ tone = "neutral", label, dot = true, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-[0.06em]",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColors[tone])} aria-hidden />}
      {label}
    </span>
  );
}
