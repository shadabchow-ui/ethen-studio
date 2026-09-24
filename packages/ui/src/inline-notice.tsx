import * as React from "react";
import { cn } from "./lib/utils";

export type NoticeTone = "neutral" | "info" | "warning" | "danger";

export interface InlineNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  title?: string;
  body: string;
  action?: React.ReactNode;
}

const toneClasses: Record<NoticeTone, string> = {
  neutral:
    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  info:
    "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  warning:
    "border-[color-mix(in_srgb,var(--status-warning)_24%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_4%,transparent)] text-[var(--text-primary)]",
  danger:
    "border-[color-mix(in_srgb,var(--status-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_4%,transparent)] text-[var(--text-primary)]",
};

const iconByTone: Record<NoticeTone, React.ReactNode> = {
  neutral: null,
  info: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 4v3.5M7 9.5h.01" stroke="var(--status-warning)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="7" r="5.5" stroke="var(--status-warning)" strokeWidth="1.3" />
    </svg>
  ),
  danger: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5.5" stroke="var(--status-danger)" strokeWidth="1.3" />
      <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="var(--status-danger)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

export function InlineNotice({ tone = "neutral", title, body, action, className, ...props }: InlineNoticeProps) {
  const icon = iconByTone[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm",
        toneClasses[tone],
        className,
      )}
      role={tone === "danger" || tone === "warning" ? "alert" : undefined}
      {...props}
    >
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-[var(--text-primary)]">{title}</p>}
        <p className={cn(title && "mt-0.5")}>{body}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
