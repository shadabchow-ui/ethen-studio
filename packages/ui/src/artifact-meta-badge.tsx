"use client";

import type { ReactNode } from "react";
import { cn } from "./lib/utils";

interface ArtifactMetaBadgeProps {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
}

const toneClasses = {
  default: "border-white/[0.10] bg-white/[0.04] text-[#a3a3a3]",
  success: "border-white/[0.08] bg-white/[0.04] text-[#93d7aa]",
  warning: "border-[#3d2c10] bg-[#2a1e0a] text-[#f0c070]",
  danger: "border-[#3a1e1e] bg-[#1a1010] text-[#f2b8b5]",
};

export function ArtifactMetaBadge({
  children,
  tone = "default",
  className,
}: ArtifactMetaBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
