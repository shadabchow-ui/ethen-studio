"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import { StatusBadge, type StatusTone } from "./status-badge";

export interface ProviderReceipt {
  providerId: string;
  toolId: string;
  action: string;
  status: "success" | "failed" | "pending" | "blocked";
  costEstimate: string | null;
  tokensUsed: number | null;
  durationMs: number | null;
  requestPayload: string | null;
  responseSummary: string | null;
  errorMessage: string | null;
  recordedAt: string;
}

export interface ProviderReceiptCardProps extends React.HTMLAttributes<HTMLDivElement> {
  receipt: ProviderReceipt;
  requestId?: string | null;
  showPayload?: boolean;
}

const statusToneMap: Record<string, StatusTone> = {
  success: "success",
  failed: "danger",
  pending: "warning",
  blocked: "neutral",
};

const statusLabelMap: Record<string, string> = {
  success: "Success",
  failed: "Failed",
  pending: "Pending",
  blocked: "Blocked",
};

export function ProviderReceiptCard({
  receipt,
  requestId,
  showPayload = false,
  className,
  ...props
}: ProviderReceiptCardProps) {
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
            <div className="flex items-center gap-2">
              <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-secondary)]">
                {receipt.providerId}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">/</span>
              <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-tertiary)]">
                {receipt.toolId}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-primary)] leading-snug">
              {receipt.action}
            </p>
          </div>
          <StatusBadge
            tone={statusToneMap[receipt.status] ?? "neutral"}
            label={statusLabelMap[receipt.status] ?? receipt.status}
          />
        </div>

        {/* Metrics */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
          {receipt.costEstimate && (
            <div>
              <span className="text-[var(--text-muted)]">Cost</span>
              <p className="mt-0.5 font-mono text-[var(--text-secondary)]">
                {receipt.costEstimate}
              </p>
            </div>
          )}
          {receipt.tokensUsed !== null && (
            <div>
              <span className="text-[var(--text-muted)]">Tokens</span>
              <p className="mt-0.5 font-mono text-[var(--text-secondary)]">
                {receipt.tokensUsed.toLocaleString()}
              </p>
            </div>
          )}
          {receipt.durationMs !== null && (
            <div>
              <span className="text-[var(--text-muted)]">Duration</span>
              <p className="mt-0.5 font-mono text-[var(--text-secondary)]">
                {(receipt.durationMs / 1000).toFixed(1)}s
              </p>
            </div>
          )}
        </div>

        {/* Response summary */}
        {receipt.responseSummary && (
          <p className="mt-2 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
            {receipt.responseSummary}
          </p>
        )}

        {/* Error */}
        {receipt.errorMessage && (
          <div className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--status-danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_5%,transparent)] px-3 py-2">
            <p className="text-[10px] text-[var(--status-danger)] font-mono">
              {receipt.errorMessage}
            </p>
          </div>
        )}

        {/* Payload (redacted) */}
        {showPayload && receipt.requestPayload && (
          <div className="mt-2">
            <span className="text-[9px] text-[var(--text-muted)]">Request Payload</span>
            <pre className="mt-1 overflow-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-[10px] font-mono text-[var(--text-tertiary)] max-h-[120px]">
              {receipt.requestPayload}
            </pre>
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-2 flex items-center gap-2">
          {requestId && (
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              {requestId}
            </span>
          )}
          <span className="text-[9px] text-[var(--text-muted)]">
            {new Date(receipt.recordedAt).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
