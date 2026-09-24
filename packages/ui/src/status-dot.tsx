import * as React from "react";
import { cn } from "./lib/utils";

export type StatusDotTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type StatusDotSize = "sm" | "md";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusDotTone;
  size?: StatusDotSize;
  pulse?: boolean;
  label?: string;
}

const dotTone: Record<StatusDotTone, string> = {
  neutral: "bg-[var(--text-tertiary)]",
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  danger:  "bg-[var(--status-danger)]",
  info:    "bg-[var(--text-secondary)]",
};

const dotSize: Record<StatusDotSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
};

const pulseRing: Record<StatusDotTone, string> = {
  neutral: "before:ring-[var(--text-tertiary)]",
  success: "before:ring-[var(--status-success)]",
  warning: "before:ring-[var(--status-warning)]",
  danger:  "before:ring-[var(--status-danger)]",
  info:    "before:ring-[var(--text-secondary)]",
};

export function StatusDot({
  tone = "neutral",
  size = "sm",
  pulse = false,
  label,
  className,
  ...props
}: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={label ?? (tone !== "neutral" ? tone : undefined)}
      className={cn(
        "relative inline-flex shrink-0 rounded-full",
        dotSize[size],
        dotTone[tone],
        pulse && [
          "before:absolute before:inset-0 before:rounded-full before:animate-ping before:opacity-30",
          pulseRing[tone],
        ],
        className,
      )}
      {...props}
    >
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
