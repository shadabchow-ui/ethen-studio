/**
 * Ethen 4 Status Chip
 * Semantic color chip for status values: live, pending, error, draft, etc.
 * More prominent than StatusBadge — suitable for table cells and card labels.
 */
import * as React from "react";
import { cn } from "./lib/utils";

export type Ethen4ChipTone = "success" | "warning" | "danger" | "neutral" | "info" | "purple";

export interface Ethen4StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Ethen4ChipTone;
  label: string;
  dot?: boolean;
}

/* Chip *text* resolves from the theme-aware --status-* tokens, not the
 * --eds-sys-status-* palette: EdsScope pins the EDS palette dark, so on a
 * light document the ochre read 2.95:1 (axe color-contrast) and the
 * "verified" ink was near-invisible. The --status-* values are the ones
 * tokens.css already audited for this exact failure (light #92400e ≈ 5.95:1
 * on the chip tint, dark #f59e0b ≈ 9.38:1). Tint and border keep the EDS
 * mix — they are decorative and pass in both themes. */
const chipClasses: Record<Ethen4ChipTone, string> = {
  success:
    "border-[color-mix(in_srgb,var(--eds-sys-status-verified)_28%,transparent)] bg-[color-mix(in_srgb,var(--eds-sys-status-verified)_8%,transparent)] text-[var(--status-success)]",
  warning:
    "border-[color-mix(in_srgb,var(--eds-sys-status-attention)_28%,transparent)] bg-[color-mix(in_srgb,var(--eds-sys-status-attention)_8%,transparent)] text-[var(--status-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--eds-sys-status-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--eds-sys-status-danger)_8%,transparent)] text-[var(--status-danger)]",
  neutral:
    "border-[var(--border-default)] bg-[var(--bg-inset)] text-[var(--text-secondary)]",
  info:
    "border-[color-mix(in_srgb,var(--eds-lapis-strong)_28%,transparent)] bg-[color-mix(in_srgb,var(--eds-lapis-strong)_8%,transparent)] text-[var(--text-secondary)]",
  purple:
    "border-[color-mix(in_srgb,var(--eds-lapis-strong)_28%,transparent)] bg-[color-mix(in_srgb,var(--eds-lapis-strong)_8%,transparent)] text-[var(--text-secondary)]",
};

const dotColors: Record<Ethen4ChipTone, string> = {
  success: "bg-[var(--eds-cmp-statusdot-verified)]",
  warning: "bg-[var(--eds-cmp-statusdot-attention)]",
  danger:  "bg-[var(--eds-cmp-statusdot-danger)]",
  neutral: "bg-[var(--text-disabled)]",
  info:    "bg-[var(--eds-cmp-statusdot-info)]",
  purple:  "bg-[var(--eds-cmp-statusdot-info)]",
};

export function Ethen4StatusChip({
  tone = "neutral",
  label,
  dot = true,
  className,
  ...props
}: Ethen4StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-[0.05em]",
        chipClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColors[tone])} aria-hidden />
      )}
      {label}
    </span>
  );
}
