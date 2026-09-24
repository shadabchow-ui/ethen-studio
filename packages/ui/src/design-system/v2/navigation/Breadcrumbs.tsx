"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";

export type V2BreadcrumbItem = { id: string; label: string; href?: string; current?: boolean };

export interface V2BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  items: readonly V2BreadcrumbItem[];
}

export const V2Breadcrumbs = forwardRef<HTMLElement, V2BreadcrumbsProps>(({ className, items, ...props }, ref) => (
  <nav ref={ref} aria-label="Breadcrumb" className={cn(styles.breadcrumbs, className)} {...props}>
    <ol className={styles.breadcrumbsList}>
      {items.map((item, index) => (
        <li key={item.id} className={styles.breadcrumbItem}>
          {item.href && !item.current ? (
            <a href={item.href} className={styles.breadcrumbLink}>
              {item.label}
            </a>
          ) : (
            <span className={item.current ? styles.breadcrumbCurrent : styles.breadcrumbMuted}>{item.label}</span>
          )}
          {index < items.length - 1 ? <span className={styles.breadcrumbSep} aria-hidden>/</span> : null}
        </li>
      ))}
    </ol>
  </nav>
));
V2Breadcrumbs.displayName = "V2Breadcrumbs";