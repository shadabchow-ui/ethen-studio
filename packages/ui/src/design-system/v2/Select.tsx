"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2SelectSize = "sm" | "md" | "lg";

const sizeClass: Record<V2SelectSize, string> = {
  sm: styles.selectSm,
  md: styles.selectMd,
  lg: styles.selectLg,
};

export interface V2SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: V2SelectSize;
  invalid?: boolean;
  placeholder?: string;
}

export const V2Select = forwardRef<HTMLSelectElement, V2SelectProps>(
  ({ className, size = "md", invalid, children, placeholder, ...props }, ref) => (
    <div className={cn(styles.selectWrap, sizeClass[size], invalid && styles.selectInvalid, className)}>
      <select ref={ref} className={styles.select} aria-invalid={invalid || undefined} {...props}>
        {placeholder ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <span className={styles.selectChevron} aria-hidden>
        <svg viewBox="0 0 16 16" fill="none" width={14} height={14}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  ),
);
V2Select.displayName = "V2Select";