/**
 * Ethen 4 Empty State
 * Centered empty-state block with icon, message, optional CTA.
 */
import * as React from "react";
import { cn } from "./lib/utils";

export interface Ethen4EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actions?: React.ReactNode;
}

export function Ethen4EmptyState({
  icon,
  title,
  body,
  actions,
  className,
  ...props
}: Ethen4EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[220px] flex-col items-center justify-center rounded-[var(--ethen-radius-element)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--border-default)] text-[var(--text-disabled)]">
          {icon}
        </div>
      ) : null}
      <p className="text-[14px] font-medium text-[var(--text-primary)]">{title}</p>
      {body ? (
        <p className="mt-2 max-w-[440px] text-[13px] leading-[1.6] text-[var(--text-muted)]">
          {body}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
