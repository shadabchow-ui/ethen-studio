"use client";

import type { ReactNode } from "react";

/**
 * Studio V2 Job 13 — shared slot state primitives.
 *
 * Honest loading / empty / error / unauthorized states for every Studio
 * workspace slot implementation. No demo rows, no invented progress.
 */

export function SlotLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-[12px] bg-[var(--bg-surface)] px-4 py-6 text-[12.5px] text-[var(--text-tertiary)]"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-secondary)]"
      />
      {label}
    </div>
  );
}

export function SlotEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-6 text-center">
      <p className="text-[12.5px] text-[var(--text-secondary)]">{title}</p>
      {hint ? <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">{hint}</p> : null}
    </div>
  );
}

export function SlotError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-6 text-center">
      <p className="text-[12.5px] text-[var(--text-secondary)]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-[9px] bg-[var(--bg-elevated)] px-4 py-2 text-[12px] font-medium text-[var(--text-primary)]"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SlotUnauthorized({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-6 text-center">
      <p className="text-[12.5px] text-[var(--text-secondary)]">{message}</p>
      <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">Sign in with a project member account to continue.</p>
    </div>
  );
}

export function SlotPanel({
  label,
  actions,
  children,
}: {
  label: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="flex min-h-0 min-w-0 flex-col gap-2.5">
      {actions ? <div className="flex shrink-0 items-center justify-end gap-2">{actions}</div> : null}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export type SlotFetchState<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "empty" }
  | { state: "error"; message: string }
  | { state: "unauthorized"; message: string };

/** Shared fetch helper: no-store, honest unauthorized/error split. */
export async function fetchSlotJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body };
}

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}
