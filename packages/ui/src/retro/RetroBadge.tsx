import { cn } from "../lib/utils";

type RetroBadgeVariant = "neutral" | "warning" | "danger" | "success";

const variants: Record<RetroBadgeVariant, string> = {
  neutral: "border-black text-black",
  warning: "border-[var(--status-warning)] text-[var(--status-warning)]",
  danger: "border-[var(--status-danger)] text-[var(--status-danger)]",
  success: "border-[var(--status-success)] text-[var(--status-success)]",
};

export function RetroBadge({
  variant = "neutral",
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { variant?: RetroBadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
