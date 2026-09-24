/**
 * Ethen 4 Page Header
 * Consistent page header with title, description, optional status badge, and actions.
 * Lighter-weight than PlatformPageHeader — no status badge required.
 */
import * as React from "react";
import { cn } from "./lib/utils";
import { StatusBadge } from "./status-badge";
import type { StatusTone } from "./status-badge";

export interface Ethen4PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  statusLabel?: string;
  statusTone?: StatusTone;
  meta?: Array<{ label: string; value: React.ReactNode }>;
  className?: string;
}

export function Ethen4PageHeader({
  title,
  description,
  actions,
  statusLabel,
  statusTone,
  meta,
  className,
}: Ethen4PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--console-text)]">
            {title}
          </h1>
          {statusLabel ? (
            <StatusBadge tone={statusTone ?? "neutral"} label={statusLabel} />
          ) : null}
        </div>
        {description ? (
          <p className="mt-1.5 max-w-[560px] text-[13px] leading-[1.6] text-[var(--console-text-muted)]">
            {description}
          </p>
        ) : null}
        {meta && meta.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {meta.map((m, i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--console-text-dim)]">
                  {m.label}
                </span>
                <span className="text-[12px] text-[var(--console-text-muted)]">{m.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
