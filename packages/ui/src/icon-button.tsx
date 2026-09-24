import * as React from "react";
import { cn } from "./lib/utils";
import v2 from "./design-system/v2/v2.module.css";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
  isLoading?: boolean;
}

const sizeClasses = {
  sm: v2.iconButtonSm,
  md: v2.iconButtonMd,
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "md", className, isLoading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        v2.iconButtonBase,
        sizeClasses[size],
        "min-h-[44px] min-w-[44px]",
        className,
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <span aria-hidden className={v2.spinner} /> : children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
