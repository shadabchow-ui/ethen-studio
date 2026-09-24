"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export interface V2ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md";
}

export const V2ButtonGroup = forwardRef<HTMLDivElement, V2ButtonGroupProps>(
  ({ className, size = "md", ...props }, ref) => (
    <div ref={ref} role="group" className={cn(styles.buttonGroup, size === "sm" ? styles.buttonGroupSm : styles.buttonGroupMd, className)} {...props} />
  ),
);
V2ButtonGroup.displayName = "V2ButtonGroup";
