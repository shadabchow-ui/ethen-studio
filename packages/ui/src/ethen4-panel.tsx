/**
 * Ethen 4 Panel
 * Glass card panel for console surfaces. Supports optional header and footer rows.
 */
import * as React from "react";
import { cn } from "./lib/utils";

export interface Ethen4PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  /** Use glass (smoked) background vs plain surface */
  variant?: "surface" | "glass";
}

const paddingClasses = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-5",
} as const;

export function Ethen4Panel({
  header,
  footer,
  padding = "md",
  variant = "surface",
  className,
  children,
  ...props
}: Ethen4PanelProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--console-border)]",
        variant === "glass"
          ? "bg-[var(--glass-panel-fill)]"
          : "bg-[var(--console-surface)]",
        className,
      )}
      {...props}
    >
      {header ? (
        <div className="flex items-center border-b border-[var(--console-border-soft)] px-4 py-3 text-[13px] font-medium text-[var(--console-text)]">
          {header}
        </div>
      ) : null}
      <div className={paddingClasses[padding]}>{children}</div>
      {footer ? (
        <div className="border-t border-[var(--console-border-soft)] px-4 py-3 text-[12px] text-[var(--console-text-muted)]">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** Lightweight table frame — overflows gracefully with an x-scroll wrapper */
export interface Ethen4TableFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  tableClassName?: string;
}

export function Ethen4TableFrame({
  className,
  tableClassName,
  children,
  ...props
}: Ethen4TableFrameProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--console-radius-md)] border border-[var(--console-border)] bg-[var(--console-surface)]",
        className,
      )}
      {...props}
    >
      <div className="console-scrollbar overflow-x-auto">
        <table
          className={cn("min-w-full border-collapse text-left text-[13px]", tableClassName)}
        >
          {children}
        </table>
      </div>
    </div>
  );
}
