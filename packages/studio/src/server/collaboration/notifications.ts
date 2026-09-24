/**
 * Studio V5 collaboration — outbox in-app notifications (STUDIO_18).
 *
 * One unread row per (user, dedupe key): repeat events for the same
 * subject collapse instead of spamming. Reading marks read_at; rows are
 * never deleted so the center stays auditable. No email/push here.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { collaborationError } from "./types";
import type { NotificationKind, StudioNotification } from "./types";
import type { ProjectScope } from "../../contracts/scope";

const KINDS: readonly NotificationKind[] = [
  "review.requested",
  "review.decided",
  "review.invalidated",
  "review.commented",
  "review.mentioned",
  "job.completed",
  "job.failed",
];

/** Canonical dedupe key for an event subject (kind + subject id). */
export function dedupeKeyFor(kind: NotificationKind, subjectId: string): string {
  if (!KINDS.includes(kind)) throw collaborationError("BAD_REQUEST", `Unknown notification kind: ${kind}.`);
  if (!subjectId.trim()) throw collaborationError("BAD_REQUEST", "Notification subject is required.");
  return `${kind}:${subjectId}`;
}

export function notify(input: {
  scope: ProjectScope;
  userId: string;
  kind: NotificationKind;
  subjectId: string;
  title: string;
  body: string;
  href?: string | null;
  idEmitted?: string;
  now: string;
}): StudioNotification {
  if (!input.userId.trim()) throw collaborationError("BAD_REQUEST", "Notification recipient is required.");
  if (!input.title.trim()) throw collaborationError("BAD_REQUEST", "Notification title is required.");
  return {
    notificationId: input.idEmitted ?? randomUUID(),
    scope: input.scope,
    userId: input.userId,
    kind: input.kind,
    dedupeKey: dedupeKeyFor(input.kind, input.subjectId),
    title: input.title.trim(),
    body: input.body.trim(),
    href: input.href ?? null,
    readAt: null,
    createdAt: input.now,
  };
}

/**
 * Collapse a fresh notification against existing unread rows: returns the
 * existing row when the (user, dedupe key) is already unread, else the
 * fresh row to insert.
 */
export function collapseDuplicate(
  fresh: StudioNotification,
  unread: readonly StudioNotification[],
): StudioNotification {
  const sameScope = (row: StudioNotification) =>
    row.scope.tenantId === fresh.scope.tenantId && row.scope.projectId === fresh.scope.projectId;
  const existing = unread.find(
    (row) => row.userId === fresh.userId && row.dedupeKey === fresh.dedupeKey && sameScope(row),
  );
  return existing ?? fresh;
}

export function markRead(input: {
  notification: StudioNotification;
  userId: string;
  now: string;
}): StudioNotification {
  if (input.notification.userId !== input.userId) {
    throw collaborationError("FORBIDDEN", "Notifications belong to their recipient.");
  }
  if (input.notification.readAt) return input.notification;
  return { ...input.notification, readAt: input.now };
}

export function unreadCount(notifications: readonly StudioNotification[], userId: string): number {
  return notifications.filter((row) => row.userId === userId && !row.readAt).length;
}
