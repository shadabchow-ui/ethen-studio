"use client";

import { cn } from "../lib/utils";

type RetroButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<RetroButtonVariant, string> = {
  primary:
    "bg-black text-white border-[1.5px] border-black hover:bg-black/86",
  secondary:
    "bg-white text-black border-[1.5px] border-black hover:bg-black/5",
  ghost:
    "bg-transparent text-black border border-transparent hover:bg-black/5",
  danger:
    "bg-white text-[var(--status-danger)] border-[1.5px] border-[var(--status-danger)]/40 hover:bg-[var(--status-danger)]/5",
};

export function RetroButton({
  variant = "primary",
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button"> & { variant?: RetroButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-none px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
