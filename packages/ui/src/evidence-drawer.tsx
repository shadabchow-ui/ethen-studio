"use client";

import * as React from "react";
import { cn } from "./lib/utils";

export interface EvidenceItem {
  id: string;
  label: string;
  contentUrl: string | null;
  summary: string;
  confidence: "high" | "medium" | "low";
  sourceName: string;
  freshness: string | null;
  verified: boolean;
}

export interface EvidenceDrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  items: EvidenceItem[];
  runId?: string | null;
  emptyLabel?: string;
  onItemClick?: (item: EvidenceItem) => void;
}

const confidenceColors: Record<string, string> = {
  high: "bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)] text-[var(--status-success)] border-[color-mix(in_srgb,var(--status-success)_20%,transparent)]",
  medium: "bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[var(--status-warning)] border-[color-mix(in_srgb,var(--status-warning)_20%,transparent)]",
  low: "bg-[color-mix(in_srgb,var(--status-danger)_10%,transparent)] text-[var(--status-danger)] border-[color-mix(in_srgb,var(--status-danger)_20%,transparent)]",
};

function formatRelative(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function EvidenceDrawer({
  items,
  runId,
  emptyLabel = "No evidence recorded.",
  onItemClick,
  className,
  ...props
}: EvidenceDrawerProps) {
  if (items.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center", className)} {...props}>
        <p className="text-[11px] text-[var(--text-tertiary)]">{emptyLabel}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
          Evidence items will appear as the run progresses
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {runId && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-[var(--text-muted)]">Run</span>
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)]">
            {runId}
          </span>
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3",
            onItemClick && "cursor-pointer hover:border-[var(--border-default)] transition-colors",
          )}
          onClick={() => onItemClick?.(item)}
        >
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <span className="text-[12px] font-medium text-[var(--text-primary)] leading-snug">
              {item.label}
            </span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[9px] font-medium shrink-0",
                confidenceColors[item.confidence] ?? confidenceColors.medium,
              )}
            >
              {item.confidence}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            {item.summary}
          </p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-tertiary)]">
              {item.sourceName}
            </span>
            {item.verified && (
              <span className="text-[9px] text-[var(--status-success)] font-medium">
                Verified
              </span>
            )}
            {item.freshness && (
              <span className="text-[9px] text-[var(--text-muted)]">
                {formatRelative(item.freshness)}
              </span>
            )}
            {item.contentUrl && (
              <span className="text-[9px] text-[var(--status-info)] truncate max-w-[200px]">
                {item.contentUrl}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
