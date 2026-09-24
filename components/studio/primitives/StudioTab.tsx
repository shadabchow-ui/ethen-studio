"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type StudioTabState =
  | "default"
  | "active"
  | "disabled"
  | "loading";

interface StudioTabProps {
  children: React.ReactNode;
  state?: StudioTabState;
  href?: string;
  onClick?: () => void;
  className?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export function StudioTab({
  children,
  state = "default",
  href,
  onClick,
  className,
  icon,
  badge,
}: StudioTabProps) {
  const isActive = state === "active";
  const isDisabled = state === "disabled";
  const isLoading = state === "loading";

  const baseStyles = cn(
    "inline-flex items-center gap-1.5 px-3 py-2 text-[11.5px] whitespace-nowrap select-none",
    "transition duration-100 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]",
    "active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-40",
    isActive
      ? "rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium shadow-[var(--shadow-inner)]"
      : "rounded-[10px] border border-transparent bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
    className,
  );

  const content = (
    <>
      {isLoading ? (
        <svg
          className="h-3 w-3 animate-spin"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
        >
          <circle
            cx="10" cy="10" r="8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="30 14"
            strokeLinecap="round"
          />
        </svg>
      ) : icon ? (
        <span className="h-3.5 w-3.5 shrink-0">{icon}</span>
      ) : null}
      {children}
      {badge ? <span className="ml-0.5">{badge}</span> : null}
    </>
  );

  if (href && !isDisabled) {
    return <Link href={href} className={baseStyles}>{content}</Link>;
  }

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={baseStyles}
    >
      {content}
    </button>
  );
}
