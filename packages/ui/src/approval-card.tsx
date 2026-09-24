"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import { StatusBadge } from "./status-badge";

export interface ApprovalCardAction {
  label: string;
  onAction: () => void;
  variant: "approve" | "reject" | "secondary";
}

export interface ApprovalCardPayload {
  title: string;
  description: string;
  riskLevel: string;
  action: string;
  resource: string;
  affectedEntities: string[];
  expiresAt: string | null;
  payloadHash: string | null;
}

export interface ApprovalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  payload: ApprovalCardPayload;
  status: "pending" | "approved" | "rejected" | "expired" | "stale" | "executed";
  actions?: ApprovalCardAction[];
  loading?: boolean;
}

const statusToneMap: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  expired: "neutral",
  stale: "warning",
  executed: "info",
};

const statusLabelMap: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  stale: "Stale",
  executed: "Executed",
};

function riskBadgeTone(risk: string): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (risk.toLowerCase()) {
    case "low":
    case "read_only":
      return "info";
    case "medium":
    case "writes_user_content":
    case "write":
      return "warning";
    case "high":
    case "external_side_effect":
      return "danger";
    case "critical":
    case "destructive":
    case "privileged":
      return "danger";
    default:
      return "neutral";
  }
}

export function ApprovalCard({
  payload,
  status,
  actions,
  loading = false,
  className,
  ...props
}: ApprovalCardProps) {
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4", className)} {...props}>
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-3 w-16 rounded bg-[var(--bg-elevated)]" />
          <div className="h-3 w-24 rounded bg-[var(--bg-elevated)]" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-3/4 rounded bg-[var(--bg-elevated)]" />
          <div className="h-3 w-full rounded bg-[var(--bg-elevated)]" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]",
        className,
      )}
      {...props}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
              {payload.title}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              {payload.description}
            </p>
          </div>
          <StatusBadge
            tone={statusToneMap[status] ?? "neutral"}
            label={statusLabelMap[status] ?? status}
          />
        </div>

        {/* Details */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <span className="text-[var(--text-muted)]">Action</span>
            <p className="mt-0.5 font-mono text-[var(--text-secondary)]">{payload.action}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Resource</span>
            <p className="mt-0.5 font-mono text-[var(--text-secondary)] truncate">{payload.resource}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Risk Level</span>
            <p className="mt-0.5">
              <StatusBadge
                tone={riskBadgeTone(payload.riskLevel)}
                label={payload.riskLevel}
                dot={false}
              />
            </p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Expires</span>
            <p className="mt-0.5 text-[var(--text-secondary)]">
              {payload.expiresAt ? new Date(payload.expiresAt).toLocaleString() : "No expiry"}
            </p>
          </div>
        </div>

        {/* Affected entities */}
        {payload.affectedEntities.length > 0 && (
          <div className="mt-2">
            <span className="text-[10px] text-[var(--text-muted)]">Affects</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {payload.affectedEntities.map((entity, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-tertiary)]"
                >
                  {entity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Payload hash indicator */}
        {payload.payloadHash && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              Hash: {payload.payloadHash.slice(0, 16)}...
            </span>
            {status === "stale" && (
              <StatusBadge tone="warning" label="Changed" dot={false} />
            )}
          </div>
        )}

        {/* Stale / expired warnings */}
        {status === "stale" && (
          <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--status-warning)_20%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_5%,transparent)] px-3 py-2">
            <p className="text-[10px] text-[var(--status-warning)]">
              Payload has changed since approval. A new approval is required.
            </p>
          </div>
        )}
        {status === "expired" && (
          <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
            <p className="text-[10px] text-[var(--text-tertiary)]">
              This approval has expired and can no longer be used.
            </p>
          </div>
        )}

        {/* Rejected state */}
        {status === "rejected" && (
          <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--status-danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_5%,transparent)] px-3 py-2">
            <p className="text-[10px] text-[var(--status-danger)]">
              This action was rejected and will not execute.
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-[var(--border-subtle)] px-4 py-2.5">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={action.onAction}
              className={cn(
                "rounded-md px-3 py-1 text-[10px] font-medium transition-colors",
                action.variant === "approve"
                  ? "bg-[color-mix(in_srgb,var(--status-success)_20%,transparent)] text-[var(--status-success)] hover:bg-[color-mix(in_srgb,var(--status-success)_30%,transparent)]"
                  : action.variant === "reject"
                    ? "bg-[color-mix(in_srgb,var(--status-danger)_20%,transparent)] text-[var(--status-danger)] hover:bg-[color-mix(in_srgb,var(--status-danger)_30%,transparent)]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
