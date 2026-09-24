"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type StudioCardState =
  | "default"
  | "hover"
  | "selected"
  | "disabled"
  | "loading"
  | "error";

interface StudioCardProps {
  children: React.ReactNode;
  className?: string;
  state?: StudioCardState;
  href?: string;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

const stateClasses: Record<StudioCardState, string> = {
  default:
    "bg-[var(--bg-surface)] border border-[var(--border-subtle)]",
  hover:
    "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
  selected:
    "bg-[var(--bg-elevated)] border border-[var(--border-default)] ring-1 ring-[var(--border-strong)]",
  disabled:
    "bg-[var(--bg-surface)] border border-[var(--border-subtle)] opacity-50 cursor-not-allowed",
  loading:
    "bg-[var(--bg-surface)] border border-[var(--border-subtle)] relative overflow-hidden",
  error:
    "bg-[var(--bg-surface)] border border-[var(--status-danger)]/30",
};

export function StudioCard({
  children,
  className,
  state = "default",
  href,
  onClick,
  onKeyDown,
}: StudioCardProps) {
  const baseStyles = cn(
    "rounded-[18px] px-5 py-5 transition duration-100",
    "hover:bg-[var(--bg-elevated)] hover:border-[var(--border-default)]",
    "active:scale-[0.985]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]",
    stateClasses[state],
    state !== "disabled" && state !== "loading" && "cursor-pointer select-none",
    className,
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
    onKeyDown?.(e);
  };

  if (href) {
    return (
      <Link
        href={href}
        className={baseStyles}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={state !== "disabled" ? 0 : undefined}
        aria-disabled={state === "disabled"}
        onClick={state !== "disabled" ? onClick : undefined}
        onKeyDown={state !== "disabled" ? handleKeyDown : undefined}
        className={baseStyles}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cn("rounded-[18px] bg-[var(--bg-surface)] px-5 py-5", className)}>
      {children}
    </div>
  );
}
