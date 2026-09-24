"use client";

import { cn } from "@ethen/ui/lib/utils";
import type { ShellStatusLabel, ShellStatusTone } from "@ethen/contracts/workspaces/shell-contract";

const toneDot: Record<ShellStatusTone, string> = {
  neutral: "bg-[var(--text-tertiary)]",
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  danger: "bg-[var(--status-danger)]",
  info: "bg-[var(--text-secondary)]",
};

const toneBorder: Record<ShellStatusTone, string> = {
  neutral: "border-[var(--border-subtle)] text-[var(--text-tertiary)]",
  success: "border-[color-mix(in_srgb,var(--status-success)_30%,transparent)] text-[var(--status-success)]",
  warning: "border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] text-[var(--status-warning)]",
  danger: "border-[color-mix(in_srgb,var(--status-danger)_30%,transparent)] text-[var(--status-danger)]",
  info: "border-[var(--border-default)] text-[var(--text-secondary)]",
};

interface ShellStatusBarProps {
  labels: ShellStatusLabel[];
  className?: string;
}

export function ShellStatusBar({ labels, className }: ShellStatusBarProps) {
  if (labels.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {labels.map((label, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
            toneBorder[label.tone ?? "neutral"],
          )}
          title={label.detail}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", toneDot[label.tone ?? "neutral"])} aria-hidden />
          {label.label}
        </span>
      ))}
    </div>
  );
}
