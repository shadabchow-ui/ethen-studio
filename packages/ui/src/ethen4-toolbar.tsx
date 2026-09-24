/**
 * Ethen 4 Toolbar
 * Search + filters on left, actions on right.
 * Dense, native-app-like bar.
 */
import * as React from "react";
import { cn } from "./lib/utils";

export interface Ethen4ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function Ethen4Toolbar({ left, right, className, children, ...props }: Ethen4ToolbarProps) {
  if (left !== undefined || right !== undefined) {
    return (
      <div
        className={cn("flex flex-wrap items-center justify-between gap-2", className)}
        {...props}
      >
        <div className="flex flex-wrap items-center gap-2">{left}</div>
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      </div>
    );
  }
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Search input for inside the toolbar */
export function Ethen4ToolbarSearch({
  placeholder = "Search...",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[var(--console-text-dim)]"
      >
        <circle cx="7" cy="7" r="3.75" stroke="currentColor" strokeWidth="1.25" />
        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        className="h-[34px] w-full min-w-[180px] rounded-[6px] border border-[var(--console-border)] bg-[var(--console-surface-data)] pl-8 pr-3 text-[13px] text-[var(--console-text)] placeholder:text-[var(--console-text-dim)] focus:border-[var(--console-border-strong)] focus:outline-none"
        {...props}
      />
    </div>
  );
}

/** Small icon button for toolbar (filter, refresh, export) */
export function Ethen4ToolbarIconButton({
  children,
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-[34px] w-[34px] items-center justify-center rounded-[6px] border border-[var(--console-border)] bg-[var(--console-surface)] text-[var(--console-text-muted)] transition-colors hover:bg-[var(--console-surface-hover)] hover:text-[var(--console-text)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
