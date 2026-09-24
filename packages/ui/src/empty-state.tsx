import * as React from "react";
import { cn } from "./lib/utils";
import { Button } from "./button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  variant?: "centered" | "inline";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  variant = "centered",
  className,
}: EmptyStateProps) {
  const isCentered = variant === "centered";

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        isCentered && "items-center justify-center text-center min-h-[200px] px-6 py-10",
        !isCentered && "rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-6",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]",
            isCentered && "text-lg",
          )}
        >
          {icon}
        </div>
      )}
      <div className={cn("flex flex-col gap-0.5", isCentered && "max-w-xs")}>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {body && <p className="text-sm text-[var(--text-tertiary)]">{body}</p>}
      </div>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
