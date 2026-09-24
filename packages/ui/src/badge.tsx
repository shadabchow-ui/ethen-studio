import * as React from "react";
import { V2Badge, type V2BadgeTone } from "./design-system/v2/Badge";

const variantToTone = {
  default: "neutral",
  muted: "neutral",
  outline: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

export type BadgeVariant = keyof typeof variantToTone;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Semantic tone alias — maps to variant by the same key name. */
  tone?: Extract<BadgeVariant, "success" | "warning" | "danger">;
}

export function Badge({ variant = "default", tone, className, ...props }: BadgeProps) {
  const resolvedVariant = tone ?? variant;
  const v2Tone: V2BadgeTone = variantToTone[resolvedVariant] ?? "neutral";

  return <V2Badge tone={v2Tone} className={className} {...props} />;
}
