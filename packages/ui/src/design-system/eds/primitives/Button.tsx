import * as React from "react";
import { Icon, type IconName } from "../../../icons";

export type EdsButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type EdsButtonDensity = "default" | "compact";

export interface EdsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: EdsButtonVariant;
  density?: EdsButtonDensity;
  isLoading?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
}

import { edsButtonClassName } from "./button-class";

export { edsButtonClassName };

export const EdsButton = React.forwardRef<HTMLButtonElement, EdsButtonProps>(
  (
    {
      variant = "primary",
      density = "default",
      isLoading = false,
      leadingIcon,
      trailingIcon,
      disabled,
      children,
      type = "button",
      className,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={edsButtonClassName(variant, density, isLoading, className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <span aria-hidden className="eds-button__spinner" /> : null}
      {leadingIcon && !isLoading ? (
        <span aria-hidden className="eds-button__icon">
          <Icon name={leadingIcon} size={16} />
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span aria-hidden className="eds-button__icon">
          <Icon name={trailingIcon} size={16} />
        </span>
      ) : null}
    </button>
  ),
);
EdsButton.displayName = "EdsButton";
