import * as React from "react";
import { cn } from "./lib/utils";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--ethen-radius-inner)] border border-[var(--ethen-border)] bg-[var(--ethen-bg-muted)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--ethen-text-secondary)] leading-none",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
