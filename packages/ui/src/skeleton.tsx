import * as React from "react";
import { cn } from "./lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const roundedClasses = {
  sm: "rounded-[var(--radius-sm)]",
  md: "rounded-[var(--radius-md)]",
  lg: "rounded-[var(--radius-lg)]",
  xl: "rounded-[var(--radius-xl)]",
  full: "rounded-[var(--radius-full)]",
};

export function Skeleton({ width, height, rounded = "md", className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("ethen-skeleton", roundedClasses[rounded], className)}
      style={{ width, height }}
      aria-hidden
      {...props}
    />
  );
}
