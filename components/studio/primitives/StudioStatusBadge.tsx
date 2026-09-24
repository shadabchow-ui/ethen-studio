import { cn } from "@/lib/utils";

export type StudioBadgeTone =
  | "live"
  | "mock"
  | "setup"
  | "coming"
  | "neutral"
  | "error"
  | "success"
  | "warning"
  | "locked"
  | "needs_key"
  | "unavailable";

export type StudioBadgeSize = "sm" | "md" | "lg";

const TONE_CLASS: Record<StudioBadgeTone, string> = {
  live: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
  mock: "bg-[var(--bg-surface)] text-[var(--text-secondary)]",
  setup: "bg-[var(--bg-surface)] text-[var(--text-secondary)]",
  coming: "bg-[var(--bg-surface)] text-[var(--text-secondary)]",
  neutral: "bg-[var(--bg-surface)] text-[var(--text-secondary)]",
  error: "bg-[var(--status-danger)]/10 text-[var(--status-danger)]",
  success: "bg-[var(--status-success)]/10 text-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]/10 text-[var(--status-warning)]",
  locked: "bg-[var(--status-danger)]/10 text-[var(--status-danger)]",
  needs_key: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  unavailable: "bg-[var(--bg-surface)] text-[var(--text-tertiary)]",
};

const SIZE_CLASS: Record<StudioBadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-[9px]",
  md: "px-2.5 py-1 text-[10px]",
  lg: "px-3 py-2 text-[11.5px]",
};

interface StudioStatusBadgeProps {
  label: string;
  tone?: StudioBadgeTone;
  size?: StudioBadgeSize;
  className?: string;
  dot?: boolean;
}

export function StudioStatusBadge({
  label,
  tone = "neutral",
  size = "md",
  className,
  dot,
}: StudioStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] font-medium select-none",
        "transition-opacity duration-150",
        TONE_CLASS[tone],
        SIZE_CLASS[size],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "live" && "bg-[var(--status-success)]",
            tone === "error" && "bg-[var(--status-danger)]",
            tone === "warning" && "bg-[var(--status-warning)]",
            tone === "success" && "bg-[var(--status-success)]",
          tone === "setup" && "bg-[var(--text-secondary)]",
          tone === "mock" && "bg-[var(--text-secondary)]",
          tone === "coming" && "bg-[var(--text-tertiary)]",
          tone === "locked" && "bg-[var(--status-danger)]",
          tone === "needs_key" && "bg-[var(--text-secondary)]",
          tone === "unavailable" && "bg-[var(--text-tertiary)]",
          (tone === "neutral" || (!tone)) && "bg-[var(--text-tertiary)]",
          )}
        />
      ) : null}
      {label}
    </span>
  );
}
