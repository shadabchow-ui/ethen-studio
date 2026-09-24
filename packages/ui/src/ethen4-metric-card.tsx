/**
 * Ethen 4 Metric Card
 * Dense stat card: number + label + optional trend/aside.
 * Wraps ConsoleMetricCard with Ethen 4 visual grammar.
 */
import * as React from "react";
import { cn } from "./lib/utils";

export interface Ethen4MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  trend?: React.ReactNode;
  muted?: boolean;
}

export function Ethen4MetricCard({
  label,
  value,
  subtitle,
  trend,
  muted: _muted = false,
  className,
  ...props
}: Ethen4MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--console-radius-md)] border border-[var(--console-border)] bg-[var(--console-surface)] px-[18px] py-4",
        className,
      )}
      {...props}
    >
      <div className="text-[12px] text-[var(--console-text-muted)]">{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tracking-[-0.02em] text-[var(--console-text)]">
        {value}
      </div>
      {subtitle ? (
        <div className="mt-1.5 text-[11px] text-[var(--console-text-faint)]">{subtitle}</div>
      ) : null}
      {trend ? (
        <div className="mt-2 text-[11px] text-[var(--console-text-dim)]">{trend}</div>
      ) : null}
    </div>
  );
}
