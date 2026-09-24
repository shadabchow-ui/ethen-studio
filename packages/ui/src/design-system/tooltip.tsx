// RECONSTRUCTED ETHEN V2 SOURCE
// ORIGINAL FILE WAS NOT FULLY RECOVERABLE
// DO NOT REPRESENT THIS FILE AS FORENSICALLY RECOVERED SOURCE

"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Compatibility surface reconstructed from the historical barrel edge and
 * the recovered UI-tooltip precedent. It intentionally uses no portal or
 * floating surface: Design Lab callers retain their own visual hierarchy.
 */
export function Tooltip({ content, children, disabled = false, className }: TooltipProps) {
  const label = typeof content === "string" ? content : undefined;
  return <span className={cn("inline-flex", className)} title={disabled ? undefined : label}>{children}</span>;
}
