import * as React from "react";
import { cn } from "./lib/utils";

// Inlined from the liquid-glass module to remove the dependency.
// These CSS classes are defined in globals.css.
const PANEL_SURFACE_CLASS = {
  smoked: "ethen-panel-smoked",
  smokedRefined: "ethen-panel-smoked-refined",
  smokedQuiet: "ethen-panel-smoked-quiet",
  solidDark: "ethen-panel-solid-dark",
  solidBlack: "ethen-panel-solid-black",
} as const;

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "glass" | "smoked" | "smokedRefined" | "smokedQuiet" | "solidDark" | "solidBlack";
  padding?: "sm" | "md" | "lg" | "none";
}

const panelVariants = {
  default: "border border-[var(--console-hairline)] bg-[var(--console-surface-card)] shadow-[var(--shadow-panel)]",
  elevated: "border border-[var(--console-hairline)] bg-[var(--console-surface-card-elevated)] shadow-[var(--shadow-sm)]",
  glass: "ethen-glass-subtle",
  smoked: PANEL_SURFACE_CLASS.smoked,
  smokedRefined: PANEL_SURFACE_CLASS.smokedRefined,
  smokedQuiet: PANEL_SURFACE_CLASS.smokedQuiet,
  solidDark: PANEL_SURFACE_CLASS.solidDark,
  solidBlack: PANEL_SURFACE_CLASS.solidBlack,
};

const paddingClasses = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  none: "",
};

export function Panel({ variant = "default", padding = "md", className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)]",
        panelVariants[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
}

export interface PanelHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PanelHeader({ title, subtitle, action, className, ...props }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-3",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
