"use client";

import { type DetailsHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export interface V2CollapsibleProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  summary: ReactNode;
  defaultOpen?: boolean;
}

export function V2Collapsible({ className, summary, children, defaultOpen, open, ...props }: V2CollapsibleProps) {
  return (
    <details className={cn(styles.collapsible, className)} open={open ?? defaultOpen} {...props}>
      <summary className={styles.collapsibleSummary}>{summary}</summary>
      <div className={styles.collapsibleContent}>{children}</div>
    </details>
  );
}
