"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export interface V2ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
}

export const V2Toolbar = forwardRef<HTMLDivElement, V2ToolbarProps>(({ className, start, center, end, ...props }, ref) => (
  <div ref={ref} role="toolbar" className={cn(styles.toolbar, className)} {...props}>
    <div className={styles.toolbarStart}>{start}</div>
    {center ? <div className={styles.toolbarCenter}>{center}</div> : null}
    <div className={styles.toolbarEnd}>{end}</div>
  </div>
));
V2Toolbar.displayName = "V2Toolbar";
