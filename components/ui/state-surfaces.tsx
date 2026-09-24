"use client";

import Link from "next/link";
import type { ApprovalRequirement, ToolRiskLevel } from "@/lib/tools/types";
import { Button } from "./button";

type SkeletonProps = { className?: string };

function SkeletonBlock({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`ethen-skeleton rounded-[var(--radius-md)] ${className}`} />;
}

export function LoadingStatus({ label = "Loading content" }: { label?: string }) {
  return <span className="sr-only" role="status" aria-live="polite">{label}</span>;
}

export function RouteSkeleton({
  category,
  label = "Loading content",
}: {
  category: "document" | "workspace" | "data" | "editor";
  label?: string;
}) {
  return (
    <div className="min-h-full w-full bg-[var(--bg-base)] p-6 text-[var(--text-primary)]" aria-busy="true">
      <LoadingStatus label={label} />
      <div className="mx-auto w-full max-w-[1660px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2"><SkeletonBlock className="h-6 w-48" /><SkeletonBlock className="h-3 w-72" /></div>
          <SkeletonBlock className="h-9 w-24" />
        </div>
        {category === "document" && <div className="max-w-3xl space-y-4"><SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-4 w-11/12" /><SkeletonBlock className="h-32 w-full" /></div>}
        {category === "data" && <><div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[1, 2, 3].map((n) => <SkeletonBlock key={n} className="h-24" />)}</div><SkeletonBlock className="h-72 w-full" /><div className="space-y-3">{[1, 2, 3, 4].map((n) => <SkeletonBlock key={n} className="h-12 w-full" />)}</div></>}
        {category === "workspace" && <div className="grid min-h-[420px] grid-cols-[minmax(0,1fr)_280px] gap-4"><SkeletonBlock className="h-full min-h-[420px]" /><SkeletonBlock className="h-full min-h-[420px]" /></div>}
        {category === "editor" && <div className="grid min-h-[420px] grid-cols-[220px_minmax(0,1fr)_280px] gap-4"><SkeletonBlock className="h-full min-h-[420px]" /><SkeletonBlock className="h-full min-h-[420px]" /><SkeletonBlock className="h-full min-h-[420px]" /></div>}
      </div>
    </div>
  );
}

export function RouteLoading({ category, label }: { category: "document" | "workspace" | "data" | "editor"; label?: string }) {
  return <RouteSkeleton category={category} label={label} />;
}

// ─── Loading Shell ────────────────────────────────────────────────────────────

export function LoadingShell({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-[var(--text-tertiary)]" role="status" aria-live="polite" aria-label={label}>
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner />
        <p className="text-sm">{label}</p>
      </div>
      {/* Skeleton hint rows */}
      <div className="flex flex-col gap-2 w-48 opacity-40" aria-hidden>
        <div className="skeleton-shimmer h-2 rounded-full w-full" />
        <div className="skeleton-shimmer h-2 rounded-full w-4/5" />
        <div className="skeleton-shimmer h-2 rounded-full w-3/5" />
      </div>
    </div>
  );
}

export function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="30 14"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Error Panel ──────────────────────────────────────────────────────────────

interface ErrorPanelProps {
  title?: string;
  body?: string;
  actions?: React.ReactNode;
  onRetry?: () => void;
}

export function ErrorPanel({
  title = "Something went wrong",
  body = "An unexpected error occurred. Try refreshing the page.",
  actions,
  onRetry,
}: ErrorPanelProps) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6">
      <div className="flex max-w-sm flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_srgb,var(--status-danger)_10%,transparent)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 5v4M8 11h.01"
              stroke="var(--status-danger)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="8" cy="8" r="6.25" stroke="var(--status-danger)" strokeWidth="1.4" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{body}</p>
        </div>
        {(actions || onRetry) && (
          <div className="flex items-center gap-2">
            {onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Not Found Panel ──────────────────────────────────────────────────────────

interface NotFoundPanelProps {
  title?: string;
  body?: string;
  backHref?: string;
  backLabel?: string;
}

export function NotFoundPanel({
  title = "Page not found",
  body = "The page you're looking for doesn't exist or has been moved.",
  backHref = "/",
  backLabel = "Go home",
}: NotFoundPanelProps) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6">
      <div className="flex max-w-sm flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 8h12M8 2l-3 6h6l-3 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{body}</p>
        </div>
        <Link
          href={backHref}
          className="inline-flex w-fit items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

export function EmptyStateCard({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex max-w-sm flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-8">
      {icon && (
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] text-lg">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {body && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{body}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Notice Banner ────────────────────────────────────────────────────────────

interface NoticeBannerProps {
  tone?: "warning" | "neutral" | "danger";
  title: string;
  body?: string;
  action?: React.ReactNode;
}

export function NoticeBanner({ tone = "neutral", title, body, action }: NoticeBannerProps) {
  const colors =
    tone === "warning"
      ? "border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_6%,transparent)]"
      : tone === "danger"
      ? "border-[color-mix(in_srgb,var(--status-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_6%,transparent)]"
      : "border-[var(--border-subtle)] bg-[var(--bg-surface)]";

  return (
    <div className={`rounded-[var(--radius-xl)] border px-5 py-4 ${colors}`}>
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      {body && <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Tool Approval Gate ───────────────────────────────────────────────────────
// Shown when a tool requires user confirmation before running.
// onApprove/onDeny are wired by the caller; this component is display-only.

interface ToolApprovalGateProps {
  toolName: string;
  riskLevel: ToolRiskLevel;
  approvalRequirement: ApprovalRequirement;
  description?: string;
  onApprove: () => void;
  onDeny: () => void;
}

export function ToolApprovalGate({
  toolName,
  riskLevel,
  approvalRequirement,
  description,
  onApprove,
  onDeny,
}: ToolApprovalGateProps) {
  const isEveryTime = approvalRequirement === "confirm_every_time";
  return (
    <div className="flex max-w-sm flex-col gap-4 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_6%,transparent)] px-6 py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 4v3.5M7 9.5h.01" stroke="var(--status-warning)" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="7" r="5.5" stroke="var(--status-warning)" strokeWidth="1.3" />
          </svg>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Approval required: <span className="font-semibold">{toolName}</span>
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Risk: <span className="font-medium">{riskLevel}</span>
            {isEveryTime && " · Required every invocation"}
          </p>
          {description && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onApprove}>Allow</Button>
        <Button variant="secondary" size="sm" onClick={onDeny}>Deny</Button>
      </div>
    </div>
  );
}

// ─── Tool Blocked Notice ──────────────────────────────────────────────────────
// Shown when a tool is policy-blocked and cannot be run under any conditions.

interface ToolBlockedNoticeProps {
  toolName: string;
  riskLevel: ToolRiskLevel;
  reason?: string;
}

export function ToolBlockedNotice({ toolName, riskLevel, reason }: ToolBlockedNoticeProps) {
  return (
    <div className="flex max-w-sm flex-col gap-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--status-danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_5%,transparent)] px-5 py-4">
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <circle cx="7" cy="7" r="5.5" stroke="var(--status-danger)" strokeWidth="1.3" />
          <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="var(--status-danger)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Tool blocked: <span className="font-semibold">{toolName}</span>
        </p>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        Risk level <span className="font-medium">{riskLevel}</span> is not permitted in this workspace.
        {reason && ` ${reason}`}
      </p>
    </div>
  );
}
