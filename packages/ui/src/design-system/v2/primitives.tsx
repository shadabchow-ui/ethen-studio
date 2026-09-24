import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

/** A small, anchored V2 overlay surface. The caller owns placement and state. */
export const V2Overlay = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn(styles.overlay, className)} {...props} />,
);
V2Overlay.displayName = "V2Overlay";

/** Shared 32px menu row used by V2 selectors and menus. */
export const V2MenuRow = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button ref={ref} type="button" className={cn(styles.menuRow, className)} {...props} />
  ),
);
V2MenuRow.displayName = "V2MenuRow";