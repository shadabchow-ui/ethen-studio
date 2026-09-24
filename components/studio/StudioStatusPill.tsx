import { cn } from "@/lib/utils";

export type StudioStatusTone =
  | "live"
  | "mock"
  | "setup"
  | "coming"
  | "neutral";

const TONE_CLASS: Record<StudioStatusTone, string> = {
  live: "text-[var(--status-success)]",
  mock: "text-[var(--text-secondary)]",
  setup: "text-[var(--text-secondary)]",
  coming: "text-[var(--text-secondary)]",
  neutral: "text-[var(--text-secondary)]",
};

const DOT_CLASS: Record<StudioStatusTone, string> = {
  live: "bg-[var(--status-success)]",
  mock: "bg-[var(--text-secondary)]",
  setup: "bg-[var(--text-secondary)]",
  coming: "bg-[var(--text-tertiary)]",
  neutral: "bg-[var(--text-tertiary)]",
};

interface StudioStatusPillProps {
  label: string;
  tone?: StudioStatusTone;
  className?: string;
}

export function StudioStatusPill({
  label,
  tone = "neutral",
  className,
}: StudioStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11.5px] font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} aria-hidden />
      {label}
    </span>
  );
}
