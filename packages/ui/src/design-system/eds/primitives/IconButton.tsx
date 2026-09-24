import * as React from "react";

export interface EdsIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  density?: "default" | "compact";
  bordered?: boolean;
  isLoading?: boolean;
}

export const EdsIconButton = React.forwardRef<HTMLButtonElement, EdsIconButtonProps>(
  ({ label, density = "default", bordered = false, isLoading = false, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={["eds-icon-button", density === "compact" ? "eds-icon-button--compact" : "", bordered ? "eds-icon-button--bordered" : ""]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <span aria-hidden className="eds-button__spinner" /> : children}
    </button>
  ),
);
EdsIconButton.displayName = "EdsIconButton";
