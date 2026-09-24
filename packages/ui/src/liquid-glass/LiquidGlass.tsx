import * as React from "react";
import { cn } from "../lib/utils";
import {
  GLASS_BASE_CLASS,
  GLASS_VARIANT_CLASS,
  type LiquidGlassVariant,
} from "./glass-variants";

export interface LiquidGlassProps {
  as?: React.ElementType;
  variant?: LiquidGlassVariant;
  interactive?: boolean;
  refracted?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export const LiquidGlass = React.forwardRef<
  HTMLElement,
  LiquidGlassProps
>(
  (
    {
      as: Tag = "div",
      variant = "standard",
      interactive = false,
      refracted = false,
      className,
      contentClassName,
      children,
    },
    ref,
  ) => {
    const composite = cn(
      GLASS_BASE_CLASS,
      GLASS_VARIANT_CLASS[variant],
      interactive && "ethen-glass-interactive",
      refracted && "ethen-glass-refracted",
      className,
    );

    return (
      <Tag ref={ref} className={composite}>
        {contentClassName ? (
          <div className={contentClassName}>{children}</div>
        ) : (
          children
        )}
      </Tag>
    );
  },
);

LiquidGlass.displayName = "LiquidGlass";
