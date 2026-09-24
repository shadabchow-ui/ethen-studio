// RECONSTRUCTED ETHEN V2 SOURCE
// ORIGINAL FILE WAS NOT FULLY RECOVERABLE
// DO NOT REPRESENT THIS FILE AS FORENSICALLY RECOVERED SOURCE

import * as React from "react";
import { cn } from "../lib/utils";

type MaterialLevel = "base" | "small" | "medium" | "large";

const materialClasses: Record<MaterialLevel, string> = {
  base: "bg-[var(--v2-canvas)]",
  small: "rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]",
  medium: "rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] shadow-[var(--v2-shadow-small)]",
  // Large is a major elevated surface, not a fullscreen frame. Fullscreen frames own 16px explicitly.
  large: "rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] shadow-[var(--v2-shadow-medium)]",
};

export interface MaterialProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: MaterialLevel;
}

/** Owns the standard surface, border, and radius decision for ordinary UI. */
export const Material = React.forwardRef<HTMLDivElement, MaterialProps>(
  ({ level = "base", className, ...props }, ref) => (
    <div ref={ref} className={cn(materialClasses[level], className)} {...props} />
  ),
);
Material.displayName = "Material";

export interface PanelProps extends MaterialProps {
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = { none: "", sm: "p-3", md: "p-4", lg: "p-6" } as const;

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ level = "small", padding = "md", className, ...props }, ref) => (
    <Material ref={ref} level={level} className={cn(paddingClasses[padding], className)} {...props} />
  ),
);
Panel.displayName = "Panel";

export function Section({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("flex flex-col gap-4", className)} {...props} />;
}

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  eyebrow?: React.ReactNode;
}

export function SectionHeader({ title, description, action, eyebrow, className, ...props }: SectionHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)} {...props}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[12px] text-[var(--v2-text-tertiary)]">{eyebrow}</p> : null}
        <h2 className="text-[16px] font-medium leading-6 text-[var(--v2-text-primary)]">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-5 text-[var(--v2-text-secondary)]">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export const Divider = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }>(
  ({ orientation = "horizontal", className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn("shrink-0 bg-[var(--v2-border-subtle)]", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
      {...props}
    />
  ),
);
Divider.displayName = "Divider";

export function Stack({ gap = "md", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { gap?: "xs" | "sm" | "md" | "lg" | "xl" }) {
  const gaps = { xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-8" } as const;
  return <div className={cn("flex flex-col", gaps[gap], className)} {...props} />;
}

export function Grid({ columns = 1, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { columns?: 1 | 2 | 3 | 4 }) {
  const columnsClass = { 1: "grid-cols-1", 2: "grid-cols-1 md:grid-cols-2", 3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3", 4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" } as const;
  return <div className={cn("grid gap-4", columnsClass[columns], className)} {...props} />;
}

export interface RowProps extends React.HTMLAttributes<HTMLElement> {
  href?: string;
  interactive?: boolean;
}

/** A row is deliberately unframed; RowGroup supplies its one shared boundary. */
export function Row({ href, interactive = Boolean(href), className, children, onClick, ...props }: RowProps) {
  const classes = cn(
    "flex min-h-10 items-center gap-3 px-4 py-2 text-[14px] text-[var(--v2-text-primary)]",
    interactive && "cursor-pointer rounded-[var(--v2-radius-base)] outline-none transition-colors hover:bg-[var(--v2-hover)] focus-visible:bg-[var(--v2-active)] focus-visible:shadow-[var(--v2-focus-ring)] active:bg-[var(--v2-active)] disabled:pointer-events-none disabled:opacity-50",
    className,
  );
  if (href) return <a href={href} className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
  if (interactive || onClick) return <button type="button" className={cn("w-full text-left", classes)} onClick={onClick} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>;
  return <div className={classes} {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
}

export const RowGroup = React.forwardRef<HTMLDivElement, MaterialProps>(
  ({ level = "small", className, ...props }, ref) => (
    <Material ref={ref} level={level} className={cn("divide-y divide-[var(--v2-border-subtle)] overflow-hidden", className)} {...props} />
  ),
);
RowGroup.displayName = "RowGroup";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  metadata?: React.ReactNode;
}

export function PageHeader({ title, description, actions, metadata, className, ...props }: PageHeaderProps) {
  return <header className={cn("flex flex-wrap items-start justify-between gap-4", className)} {...props}>
    <div className="min-w-0"><h1 className="text-[20px] font-medium leading-7 text-[var(--v2-text-primary)]">{title}</h1>{description ? <p className="mt-1 text-[13px] leading-5 text-[var(--v2-text-secondary)]">{description}</p> : null}{metadata ? <div className="mt-3">{metadata}</div> : null}</div>
    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
  </header>;
}

// The original source ends at the PageHeader actions branch above. The remaining
// primitives are a narrow reconstruction from recovered Design Lab callers.
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--v2-border-default)] bg-[var(--v2-surface)] text-[var(--v2-text-secondary)]",
  info: "border-[color-mix(in_srgb,var(--v2-accent)_35%,var(--v2-border-default))] bg-[color-mix(in_srgb,var(--v2-accent)_10%,var(--v2-surface))] text-[var(--v2-text-primary)]",
  success: "border-[color-mix(in_srgb,#22c55e_35%,var(--v2-border-default))] bg-[color-mix(in_srgb,#22c55e_10%,var(--v2-surface))] text-[var(--v2-text-primary)]",
  warning: "border-[color-mix(in_srgb,#f59e0b_35%,var(--v2-border-default))] bg-[color-mix(in_srgb,#f59e0b_10%,var(--v2-surface))] text-[var(--v2-text-primary)]",
  danger: "border-[color-mix(in_srgb,#ef4444_35%,var(--v2-border-default))] bg-[color-mix(in_srgb,#ef4444_10%,var(--v2-surface))] text-[var(--v2-text-primary)]",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { tone?: Tone; }
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span className={cn("inline-flex min-h-5 items-center rounded-full border px-2 text-[12px] font-medium leading-5", toneClasses[tone], className)} {...props} />;
}

export interface StatusProps extends React.HTMLAttributes<HTMLSpanElement> { label?: React.ReactNode; tone?: Tone; }
export function Status({ label, tone = "neutral", className, children, ...props }: StatusProps) {
  return <span className={cn("inline-flex items-center gap-1.5 text-[12px] text-[var(--v2-text-secondary)]", className)} {...props}><span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : tone === "danger" ? "bg-red-500" : tone === "info" ? "bg-blue-500" : "bg-[var(--v2-text-tertiary)]")} />{label ?? children}</span>;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("h-4 animate-pulse rounded-[var(--v2-radius-base)] bg-[var(--v2-hover)]", className)} {...props} />;
}

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; }
export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return <div className={cn("flex min-h-32 flex-col items-start justify-center px-4 py-6 text-left", className)} {...props}><h3 className="text-[14px] font-medium text-[var(--v2-text-primary)]">{title}</h3>{description ? <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--v2-text-secondary)]">{description}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div>;
}

export function InlineCode({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <code className={cn("rounded-[var(--v2-radius-base)] bg-[var(--v2-hover)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--v2-text-primary)]", className)} {...props} />;
}

export function Metadata({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-[12px] leading-4 text-[var(--v2-text-tertiary)]", className)} {...props} />;
}

export interface KeyValueProps extends React.HTMLAttributes<HTMLDivElement> { label: React.ReactNode; value: React.ReactNode; }
export function KeyValue({ label, value, className, ...props }: KeyValueProps) {
  return <div className={cn("flex items-baseline justify-between gap-4 text-[13px]", className)} {...props}><span className="text-[var(--v2-text-tertiary)]">{label}</span><span className="min-w-0 text-right text-[var(--v2-text-primary)]">{value}</span></div>;
}

export function Toolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="toolbar" className={cn("flex min-h-8 flex-wrap items-center justify-between gap-2", className)} {...props} />;
}

export interface DetailShellProps extends React.HTMLAttributes<HTMLElement> { breadcrumb?: React.ReactNode; header: React.ReactNode; context?: React.ReactNode; }
export function DetailShell({ breadcrumb, header, context, children, className, ...props }: DetailShellProps) {
  return <section className={cn("grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]", className)} {...props}><div className="min-w-0 space-y-5">{breadcrumb ? <p className="text-[12px] text-[var(--v2-text-tertiary)]">{breadcrumb}</p> : null}{header}{children}</div>{context ? <aside className="border-l border-[var(--v2-border-subtle)] pl-5">{context}</aside> : null}</section>;
}

export interface SettingsShellProps extends React.HTMLAttributes<HTMLElement> { navigation: React.ReactNode; header: React.ReactNode; }
export function SettingsShell({ navigation, header, children, className, ...props }: SettingsShellProps) {
  return <section className={cn("grid min-w-0 gap-6 md:grid-cols-[13rem_minmax(0,1fr)]", className)} {...props}><nav aria-label="Settings navigation" className="min-w-0 border-r border-[var(--v2-border-subtle)] pr-4">{navigation}</nav><div className="min-w-0 space-y-6">{header}{children}</div></section>;
}
