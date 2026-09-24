"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
export type V2BadgeSize = "sm" | "md";

const toneClass: Record<V2BadgeTone, string> = {
  neutral: styles.badgeNeutral,
  info: styles.badgeInfo,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
};

const sizeClass: Record<V2BadgeSize, string> = {
  sm: styles.badgeSm,
  md: styles.badgeMd,
};

export interface V2BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: V2BadgeTone;
  size?: V2BadgeSize;
  dot?: boolean;
}

export const V2Badge = forwardRef<HTMLSpanElement, V2BadgeProps>(
  ({ className, tone = "neutral", size = "md", dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(styles.badge, toneClass[tone], sizeClass[size], className)} {...props}>
      {dot ? <span className={styles.badgeDot} aria-hidden /> : null}
      {children}
    </span>
  ),
);
V2Badge.displayName = "V2Badge";

/** Status dot — small pill-adjacent inline status indicator */
export function V2StatusDot({ tone = "neutral", className, ...props }: { tone?: V2BadgeTone; className?: string } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(styles.statusDot, styles[`statusDot_${tone}` as never] ?? "", className)} aria-hidden {...props} />;
}