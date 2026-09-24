// RECOVERY-18 R_MINIMAL_BRIDGE — required by transcript-supported Designer/Workflow shells.
"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2SegmentedOption = { id: string; label: string; disabled?: boolean };
export interface V2SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: readonly V2SegmentedOption[];
  value: string;
  onValueChange: (id: string) => void;
  size?: "sm" | "md";
}

export const V2SegmentedControl = forwardRef<HTMLDivElement, V2SegmentedControlProps>(
  ({ className, options, value, onValueChange, size = "md", ...props }, ref) => (
    <div ref={ref} role="group" className={cn(styles.segmented, size === "sm" ? styles.segmentedSm : styles.segmentedMd, className)} {...props}>
      {options.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} disabled={option.disabled} className={cn(styles.segment, value === option.id && styles.segmentSelected)} onClick={() => onValueChange(option.id)}>{option.label}</button>)}
    </div>
  ),
);
V2SegmentedControl.displayName = "V2SegmentedControl";
