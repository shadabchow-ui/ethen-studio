import { cn } from "@/lib/utils";

interface StudioPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "inset";
  padding?: "none" | "sm" | "md" | "lg";
}

const variantClasses = {
  default: "border border-[var(--border-subtle)] bg-[var(--bg-surface)]",
  elevated: "border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]",
  inset: "border border-[var(--border-subtle)] bg-[var(--bg-inset)]",
};

const paddingClasses = {
  none: "",
  sm: "px-3 py-3",
  md: "px-4 py-4",
  lg: "px-5 py-5",
};

export function StudioPanel({
  children,
  className,
  variant = "default",
  padding = "md",
}: StudioPanelProps) {
  return (
    <div
      className={cn(
        "rounded-[24px]",
        "transition duration-100",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
