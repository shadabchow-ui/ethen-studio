"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export interface V2SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}

export const V2Switch = forwardRef<HTMLButtonElement, V2SwitchProps>(
  ({ className, checked, onCheckedChange, label, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn(styles.switch, checked && styles.switchChecked, className)}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span className={styles.switchThumb} />
    </button>
  ),
);
V2Switch.displayName = "V2Switch";