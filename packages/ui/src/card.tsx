import * as React from "react";
import { cn } from "./lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @deprecated Use an actual Link/Button wrapper for interactive cards. */
  clickable?: boolean;
  padding?: "sm" | "md" | "lg" | "none";
}

export function Card({ clickable: _clickable, padding = "md", className, ...props }: CardProps) {
  const paddingClasses = {
    sm: "p-3",
    md: "p-4",
    lg: "p-5",
    none: "p-0",
  };
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--console-hairline)] bg-[var(--console-surface-card)] shadow-[var(--shadow-panel)]",
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
}
