import * as React from "react";
import { cn } from "./lib/utils";

export type LiquidGlassVariant =
  | "panel"
  | "composer"
  | "control"
  | "floating"
  | "header"
  | "media";

export type LiquidGlassIntensity = "low" | "medium" | "high";

export type LiquidGlassRadius = "md" | "lg" | "xl" | "blob";

export interface LiquidGlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: LiquidGlassVariant;
  intensity?: LiquidGlassIntensity;
  radius?: LiquidGlassRadius;
}

export const LiquidGlassPanel = React.forwardRef<HTMLDivElement, LiquidGlassPanelProps>(
  (
    {
      variant = "panel",
      intensity = "medium",
      radius = "xl",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "ethen-liquid-panel",
          `ethen-liquid-panel--${variant}`,
          `ethen-liquid-panel--${intensity}`,
          `ethen-liquid-radius--${radius}`,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

LiquidGlassPanel.displayName = "LiquidGlassPanel";
