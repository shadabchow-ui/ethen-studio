/**
 * STUDIO_18 — notification center.
 * Recipient-scoped in-app outbox: unread count, newest first,
 * one-tap mark-read. Repeat events collapse server-side, so the
 * center never shows duplicate unread rows for one subject.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkNotificationView, WorkUiState } from "./types";

export function NotificationsCenter({
  uiState,
  notifications,
  unread,
  busy,
  onRetry,
  onMarkRead,
}: {
  uiState: WorkUiState;
  notifications: readonly WorkNotificationView[];
  unread: number;
  busy: string | null;
  onRetry: () => void;
  onMarkRead: (notification: WorkNotificationView) => void;
}) {
  // VISUAL-05 — group activity by work context (notification kind),
  // newest-first within each group, unread surfaced per group.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byKind = new Map<string, WorkNotificationView[]>();
    for (const notification of notifications) {
      const list = byKind.get(notification.kind);
      if (list) list.push(notification);
      else {
        byKind.set(notification.kind, [notification]);
        order.push(notification.kind);
      }
    }
    return order.map((kind) => ({ kind, items: byKind.get(kind) ?? [] }));
  }, [notifications]);

  return (
    <section aria-label="Notifications" data-testid="work-notifications" className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        Studio work · notifications{unread > 0 ? ` · ${unread} unread` : ""}
      </p>
      {uiState.state === "loading" ? (
        <p role="status" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
          Loading notifications…
        </p>
      ) : null}
      {uiState.state === "empty" ? (
        <StudioEmptyState
          title="All caught up"
          description="Review decisions, comments, and job completions land here."
          actionLabel="View jobs"
          actionHref={typeof window !== "undefined" ? `/studio/work/jobs?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/jobs"}
          testId="work-notifications-empty"
        />
      ) : null}
      {uiState.state === "setup" ? (
        <StudioSetupState
          what="Notifications"
          dependency={uiState.dependency}
          primaryLabel="Go to Assets"
          primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
          testId="work-notifications-setup"
        />
      ) : null}
      {(uiState.state === "error" || uiState.state === "permission") && (
        <StudioErrorState
          title={uiState.state === "permission" ? "Sign in required" : "Notifications unavailable"}
          description={uiState.message ?? "Notification listing failed."}
          retryLabel={uiState.state === "error" ? "Retry" : undefined}
          onRetry={uiState.state === "error" ? onRetry : undefined}
          testId="work-notifications-error"
        />
      )}
      {uiState.state === "ready" ? (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupUnread = group.items.filter((item) => !item.readAt).length;
            return (
              <section key={group.kind} aria-label={`${group.kind} notifications`}>
                <h3 className="mb-2 text-[12px] font-medium text-[var(--text-secondary)]">
                  {group.kind} · {group.items.length} update{group.items.length === 1 ? "" : "s"}
                  {groupUnread > 0 ? ` · ${groupUnread} unread` : ""}
                </h3>
                <ul className="space-y-2">
                  {group.items.map((notification) => (
            <li
              key={notification.notificationId}
              className={`rounded-[12px] px-4 py-3 ${notification.readAt ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-elevated)]"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[13.5px] text-[var(--text-primary)]">{notification.title}</h3>
                  {notification.body ? (
                    <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-secondary)]">{notification.body}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                    {notification.kind}
                    {notification.readAt ? " · read" : " · unread"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {notification.href && notification.href.startsWith("/studio/") ? (
                    <Link
                      href={notification.href}
                      className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      Open
                    </Link>
                  ) : null}
                  {!notification.readAt ? (
                    <button
                      type="button"
                      disabled={busy === notification.notificationId}
                      onClick={() => onMarkRead(notification)}
                      className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      {busy === notification.notificationId ? "Marking…" : "Mark read"}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
