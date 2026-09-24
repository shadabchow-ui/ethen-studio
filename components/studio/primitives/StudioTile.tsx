"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type StudioTileState =
  | "default"
  | "selected"
  | "disabled"
  | "loading"
  | "error";

interface StudioTileProps {
  children: React.ReactNode;
  className?: string;
  state?: StudioTileState;
  href?: string;
  onClick?: () => void;
  aspect?: "wide" | "square" | "portrait" | "ultrawide";
}

const aspectClasses = {
  wide: "aspect-[16/10]",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  ultrawide: "aspect-[21/9]",
};

export function StudioTile({
  children,
  className,
  state = "default",
  href,
  onClick,
  aspect = "square",
}: StudioTileProps) {
  const isDisabled = state === "disabled";
  const isSelected = state === "selected";
  const isLoading = state === "loading";
  const isError = state === "error";

  const baseStyles = cn(
    "group relative overflow-hidden rounded-[16px]",
    "transition duration-100 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
    "active:scale-[0.985]",
    aspectClasses[aspect],
    isDisabled && "opacity-40 cursor-not-allowed",
    isSelected && "ring-2 ring-white/30",
    isError && "ring-2 ring-[var(--status-danger)]/40",
    !isDisabled && "cursor-pointer",
    className,
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  if (href && !isDisabled) {
    return (
      <Link href={href} className={baseStyles}>
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-elevated)]/80 z-10">
            <svg className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" strokeDasharray="30 14" strokeLinecap="round" />
            </svg>
          </div>
        ) : null}
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={isDisabled ? undefined : 0}
        aria-disabled={isDisabled}
        onClick={isDisabled ? undefined : onClick}
        onKeyDown={isDisabled ? undefined : handleKeyDown}
        className={baseStyles}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-elevated)]/80 z-10">
            <svg className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" strokeDasharray="30 14" strokeLinecap="round" />
            </svg>
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <div className={cn("rounded-[16px] bg-[var(--bg-inset)]", aspectClasses[aspect], className)}>
      {children}
    </div>
  );
}
