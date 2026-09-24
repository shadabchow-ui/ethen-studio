import * as React from "react";
import { cn } from "./lib/utils";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  label?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  sm: "h-3.5 w-3.5 border-[1.5px]",
  md: "h-5 w-5 border-2",
  lg: "h-7 w-7 border-[2.5px]",
};

export function Spinner({ size = "md", label = "Loading", className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-current border-r-transparent text-[var(--text-tertiary)] motion-reduce:animate-[spin_1.5s_linear_infinite]",
        sizeMap[size],
        className,
      )}
      {...props}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
