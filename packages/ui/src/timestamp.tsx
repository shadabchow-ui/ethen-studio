"use client";

import * as React from "react";
import { cn } from "./lib/utils";

export interface TimestampProps extends React.HTMLAttributes<HTMLTimeElement> {
  value: string | number | Date;
  format?: "relative" | "absolute" | "datetime";
  includeTitle?: boolean;
}

function parseDate(value: string | number | Date): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

function relativeText(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  const abs = Math.abs(diff);

  if (diff >= 0) {
    // past
    if (abs < SECOND * 5) return "just now";
    if (abs < MINUTE) return `${Math.round(abs / SECOND)}s ago`;
    if (abs < HOUR) return `${Math.round(abs / MINUTE)}m ago`;
    if (abs < DAY) return `${Math.round(abs / HOUR)}h ago`;
    if (abs < WEEK) return `${Math.round(abs / DAY)}d ago`;
    if (abs < MONTH) return `${Math.round(abs / WEEK)}w ago`;
    return `${Math.round(abs / MONTH)}mo ago`;
  }

  // future
  if (abs < MINUTE) return `in ${Math.round(abs / SECOND)}s`;
  if (abs < HOUR) return `in ${Math.round(abs / MINUTE)}m`;
  if (abs < DAY) return `in ${Math.round(abs / HOUR)}h`;
  if (abs < DAY * 5) return `in ${Math.round(abs / DAY)}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function absoluteText(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function datetimeText(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Timestamp({
  value,
  format = "relative",
  includeTitle = false,
  className,
  ...props
}: TimestampProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const date = parseDate(value);

  if (!date) {
    return (
      <time className={cn("text-[var(--text-muted)]", className)} {...props}>
        —
      </time>
    );
  }

  const iso = date.toISOString();
  const title = date.toLocaleString();

  // Server and first client render: stable text to avoid hydration mismatch
  const stableText = format === "relative" ? absoluteText(date) : format === "absolute" ? absoluteText(date) : datetimeText(date);

  // Client-mounted render: relative text when format is relative
  const displayText = mounted && format === "relative"
    ? relativeText(date)
    : format === "absolute"
      ? absoluteText(date)
      : format === "datetime"
        ? datetimeText(date)
        : stableText;

  return (
    <time
      dateTime={iso}
      title={includeTitle ? title : undefined}
      className={cn("text-[var(--text-muted)]", className)}
      {...props}
    >
      {displayText}
    </time>
  );
}
