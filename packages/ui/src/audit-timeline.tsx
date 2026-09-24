"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import { StatusBadge, type StatusTone } from "./status-badge";

export interface AuditTimelineEntry {
  id: string;
  eventType: string;
  label: string;
  summary: string;
  toolId?: string;
  actor?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  entries: AuditTimelineEntry[];
  emptyLabel?: string;
  maxEntries?: number;
  showActor?: boolean;
  showTool?: boolean;
}

const eventToneMap: Record<string, StatusTone> = {
  "action_executed": "success",
  "action_approved": "success",
  "approval.approved": "success",
  "tool.executed": "success",
  "tool.succeeded": "success",
  "tool.called": "info",
  "tool.proposed": "info",
  "artifact.created": "info",
  "asset.created": "info",
  "run.started": "info",
  "run.updated": "info",
  "run.completed": "success",
  "report.generated": "info",
  "provider.selected": "info",
  "usage.recorded": "info",
  "evidence.recorded": "info",
  "action_executing": "warning",
  "approval.requested": "warning",
  "action_approval_requested": "warning",
  "action_rejected": "danger",
  "approval.rejected": "danger",
  "action_failed": "danger",
  "run.failed": "danger",
  "tool.failed": "danger",
  "provider.failed": "danger",
  "tool.blocked": "neutral",
  "run.blocked": "neutral",
  "action_blocked": "neutral",
  "action_canceled": "neutral",
  "budget.threshold_reached": "warning",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AuditTimeline({
  entries,
  emptyLabel = "No audit events yet.",
  maxEntries,
  showActor = false,
  showTool = false,
  className,
  ...props
}: AuditTimelineProps) {
  const displayed = maxEntries ? entries.slice(0, maxEntries) : entries;

  if (displayed.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center", className)} {...props}>
        <p className="text-[11px] text-[var(--text-tertiary)]">{emptyLabel}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
          Events will appear here as actions are taken
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)} {...props}>
      {displayed.map((entry, i) => {
        const isLast = i === displayed.length - 1;
        const tone = eventToneMap[entry.eventType] ?? "neutral";

        return (
          <div key={entry.id} className="flex items-start gap-2.5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold",
                  tone === "success" && "bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)] text-[var(--status-success)]",
                  tone === "warning" && "bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)] text-[var(--status-warning)]",
                  tone === "danger" && "bg-[color-mix(in_srgb,var(--status-danger)_15%,transparent)] text-[var(--status-danger)]",
                  tone === "info" && "bg-[color-mix(in_srgb,var(--text-secondary)_15%,transparent)] text-[var(--text-secondary)]",
                  tone === "neutral" && "bg-[var(--bg-elevated)] text-[var(--text-tertiary)]",
                )}
              >
                {entry.eventType.startsWith("run.") ? "R" :
                  entry.eventType.startsWith("tool.") ? "T" :
                    entry.eventType.startsWith("approval.") ? "A" :
                      entry.eventType.startsWith("action_") ? "AC" :
                        entry.eventType.startsWith("artifact.") ? "AR" :
                          entry.eventType.startsWith("asset.") ? "AS" :
                            entry.eventType.startsWith("provider.") ? "P" :
                              entry.eventType.startsWith("usage.") ? "U" :
                                entry.eventType.startsWith("evidence.") ? "EV" : "?"}
              </span>
              {!isLast && (
                <div className="mt-0.5 h-full w-px bg-[var(--border-subtle)] min-h-[12px]" />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-[var(--text-secondary)] leading-snug truncate">
                  {entry.summary}
                </p>
                <StatusBadge tone={tone} label={entry.label} dot={false} className="shrink-0" />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[9px] text-[var(--text-muted)] font-mono">
                <span>{formatTime(entry.createdAt)}</span>
                {showTool && entry.toolId && <span>· {entry.toolId}</span>}
                {showActor && entry.actor && <span>· {entry.actor}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
