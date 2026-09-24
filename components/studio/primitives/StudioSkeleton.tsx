import { cn } from "@/lib/utils";

interface StudioSkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: string | number;
}

export function StudioSkeleton({
  className,
  variant = "rectangular",
  width,
  height,
}: StudioSkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse bg-[var(--bg-elevated)]",
        variant === "circular" && "rounded-full",
        variant === "text" && "h-3 rounded-full",
        variant === "card" && "rounded-[18px]",
        variant === "rectangular" && "rounded-[8px]",
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function StudioCardSkeleton() {
  return (
    <div className="rounded-[18px] bg-[var(--bg-surface)] px-5 py-5 space-y-3">
      <StudioSkeleton variant="text" className="w-3/5" />
      <StudioSkeleton variant="text" className="w-full" />
      <StudioSkeleton variant="text" className="w-4/5" />
    </div>
  );
}

export function StudioMediaSkeleton({ aspect = "square" }: { aspect?: "wide" | "square" | "portrait" | "ultrawide" }) {
  const aspectClass =
    aspect === "wide" ? "aspect-[16/10]" :
    aspect === "portrait" ? "aspect-[4/5]" :
    aspect === "ultrawide" ? "aspect-[21/9]" :
    "aspect-square";

  return (
    <div className={cn("rounded-[16px] bg-[var(--bg-inset)] overflow-hidden", aspectClass)}>
      <div className="h-full w-full animate-pulse bg-[var(--bg-elevated)]" />
    </div>
  );
}
