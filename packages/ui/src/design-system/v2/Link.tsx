"use client";

import { forwardRef, type AnchorHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2LinkVariant = "default" | "muted" | "danger";

const variantClass: Record<V2LinkVariant, string> = {
  default: styles.linkDefault,
  muted: styles.linkMuted,
  danger: styles.linkDanger,
};

export interface V2LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: V2LinkVariant;
  external?: boolean;
}

export const V2Link = forwardRef<HTMLAnchorElement, V2LinkProps>(
  ({ className, variant = "default", external, children, ...props }, ref) => (
    <a ref={ref} className={cn(styles.link, variantClass[variant], className)} {...props}>
      {children}
      {external ? (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className={styles.linkExternalIcon}>
          <path d="M6 4h6v6M12 4L4 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </a>
  ),
);
V2Link.displayName = "V2Link";
