"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

const toneClass: Record<V2BannerTone, string> = {
  info: styles.bannerInfo,
  success: styles.bannerSuccess,
  warning: styles.bannerWarning,
  danger: styles.bannerDanger,
  neutral: styles.bannerNeutral,
};

export interface V2BannerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: V2BannerTone;
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export const V2Banner = forwardRef<HTMLDivElement, V2BannerProps>(
  ({ className, tone = "neutral", title, dismissible, onDismiss, children, ...props }, ref) => (
    <div ref={ref} role={tone === "danger" ? "alert" : "status"} className={cn(styles.banner, toneClass[tone], className)} {...props}>
      <div className={styles.bannerContent}>
        {title ? <strong className={styles.bannerTitle}>{title}</strong> : null}
        <span className={styles.bannerText}>{children}</span>
      </div>
      {dismissible ? (
        <button type="button" aria-label="Dismiss" className={styles.bannerDismiss} onClick={onDismiss}>
          ×
        </button>
      ) : null}
    </div>
  ),
);
V2Banner.displayName = "V2Banner";
