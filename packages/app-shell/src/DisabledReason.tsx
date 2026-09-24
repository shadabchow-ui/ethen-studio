"use client";

import { cn } from "@ethen/ui/lib/utils";

interface DisabledReasonProps {
  reason: string;
  tone?: "warning" | "neutral" | "setup-required";
  className?: string;
  action?: { label: string; onClick: () => void };
}

const toneStyles: Record<string, string> = {
  warning:
    "border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_6%,transparent)] text-[var(--status-warning)]",
  "setup-required":
    "border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_4%,transparent)] text-[var(--text-primary)]",
  neutral:
    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
};

export function DisabledReason({
  reason,
  tone = "setup-required",
  className,
  action,
}: DisabledReasonProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs",
        toneStyles[tone],
        className,
      )}
      role="status"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5 shrink-0" aria-hidden>
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 4v2.5M6 8.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="flex-1">
        <p>{reason}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-1 inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--bg-inset)]"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
