/**
 * STUDIO_18 — work API envelope parsing (browser-safe).
 *
 * Every fetcher maps the V1 envelope into typed views and throws a
 * WorkApiError carrying a distinct consumer state; fetch failures are
 * never empty success, and malformed rows are skipped, never crashing.
 */
import type { StudioDataState } from "../shell/types";
import { translateStudioAuthFailure } from "@/components/studio/auth/studio-auth-action-core";
import type {
  WorkAssetView,
  WorkCommentView,
  WorkJobView,
  WorkLinkView,
  WorkNotificationView,
  WorkProjectView,
  WorkReviewView,
} from "./types";

export class WorkApiError extends Error {
  readonly state: StudioDataState;
  readonly code: string | null;
  readonly dependency: string | null;
  constructor(state: StudioDataState, message: string, code: string | null = null, dependency: string | null = null) {
    super(message);
    this.name = "WorkApiError";
    this.state = state;
    this.code = code;
    this.dependency = dependency;
  }
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function workStateForErrorCode(code: string | null): StudioDataState {
  if (code === "SETUP_REQUIRED") return "setup";
  // S4C: unauthenticated reads land on the signed-out ("permission") state,
  // which renders a Clerk sign-in affordance instead of raw auth errors.
  if (
    code === "UNAUTHORIZED" ||
    code === "FORBIDDEN" ||
    code === "AUTHENTICATION_REQUIRED" ||
    code === "unauthenticated" ||
    code === "signed_out"
  ) {
    return "permission";
  }
  return "error";
}

function errorCodeOf(envelope: unknown): string | null {
  const root = asRecord(envelope);
  if (!root) return null;
  const error = asRecord(root["error"]);
  const code = error ? asString(error["code"], "") : asString(root["code"], "");
  return code || null;
}

function messageOf(envelope: unknown, fallback: string): string {
  const root = asRecord(envelope);
  const error = root ? asRecord(root["error"]) : null;
  const message = error ? asString(error["message"], "") : asString(root?.["message"], "");
  return message || fallback;
}

function dependencyOf(envelope: unknown): string | null {
  const root = asRecord(envelope);
  const error = root ? asRecord(root["error"]) : null;
  const details = error ? asRecord(error["details"]) : null;
  const dependency = details ? asNullableString(details["dependency"]) : null;
  return dependency;
}

async function readEnvelope(response: Response, fallback: string, action?: string): Promise<Json> {
  let envelope: unknown = null;
  try {
    envelope = (await response.json()) as unknown;
  } catch {
    throw new WorkApiError("error", fallback);
  }
  const root = asRecord(envelope);
  if (!response.ok || !root || root["ok"] !== true) {
    const code = errorCodeOf(envelope);
    // S4C: only user-initiated mutations (action set) open the Clerk modal;
    // background reads fail to signed-out states without auto-modal.
    if (action) translateStudioAuthFailure(response.status, code, action);
    throw new WorkApiError(workStateForErrorCode(code), messageOf(envelope, fallback), code, dependencyOf(envelope));
  }
  return asRecord(root["data"]) ?? {};
}

function parseProject(row: unknown): WorkProjectView | null {
  const item = asRecord(row);
  if (!item) return null;
  const projectId = asString(item["projectId"], "");
  if (!projectId) return null;
  return {
    projectId,
    name: asString(item["name"], projectId),
    revision: asNumber(item["revision"], 1),
    assetCount: typeof item["assetCount"] === "number" ? (item["assetCount"] as number) : undefined,
  };
}

export async function fetchWorkProjects(): Promise<WorkProjectView[]> {
  const response = await fetch("/api/studio/v1/projects?limit=50");
  const data = await readEnvelope(response, "Project listing is unavailable.");
  const items = Array.isArray(data["items"]) ? data["items"] : [];
  return items.map(parseProject).filter((row): row is WorkProjectView => row !== null);
}

function parseAsset(row: unknown): WorkAssetView | null {
  const item = asRecord(row);
  if (!item) return null;
  const assetId = asString(item["assetId"], "");
  if (!assetId) return null;
  return {
    assetId,
    filename: asString(item["filename"], assetId),
    kind: asString(item["kind"], "asset"),
    revision: asNumber(item["revision"], 1),
    latestVersion: asNumber(item["latestVersion"], 0),
    createdAt: asString(item["createdAt"], ""),
  };
}

export async function fetchWorkAssets(projectId: string, query: string): Promise<WorkAssetView[]> {
  const params = new URLSearchParams({ projectId, limit: "50" });
  if (query.trim()) params.set("query", query.trim());
  const response = await fetch(`/api/studio/v1/assets?${params.toString()}`);
  const data = await readEnvelope(response, "Asset listing is unavailable.");
  const items = Array.isArray(data["items"]) ? data["items"] : [];
  return items.map(parseAsset).filter((row): row is WorkAssetView => row !== null);
}

const REVIEW_LABELS: Readonly<Record<string, string>> = {
  requested: "Requested",
  approved: "Approved",
  changes_requested: "Changes requested",
  denied: "Denied",
  cancelled: "Cancelled",
  expired: "Expired",
  invalidated: "Invalidated — new review needed",
};

function parseReview(row: unknown): WorkReviewView | null {
  const item = asRecord(row);
  if (!item) return null;
  const reviewId = asString(item["reviewId"], "");
  if (!reviewId) return null;
  const pins = Array.isArray(item["pinnedAssets"]) ? item["pinnedAssets"] : [];
  const validity = asRecord(item["validity"]);
  const status = asString(item["status"], "requested");
  return {
    reviewId,
    title: asString(item["title"], reviewId),
    status,
    statusLabel: REVIEW_LABELS[status] ?? status,
    pinnedAssets: pins.map((pin) => {
      const record = asRecord(pin) ?? {};
      return {
        assetId: asString(record["assetId"], ""),
        version: typeof record["version"] === "number" ? (record["version"] as number) : null,
        contentHash: asNullableString(record["contentHash"]),
      };
    }),
    requestedBy: asString(item["requestedBy"], ""),
    decidedBy: asNullableString(item["decidedBy"]),
    feedback: asNullableString(item["feedback"]),
    valid: validity ? validity["valid"] === true : true,
    validityReason: validity ? asNullableString(validity["reason"]) : null,
    expiresAt: asNullableString(item["expiresAt"]),
    updatedAt: asString(item["updatedAt"], ""),
  };
}

export async function fetchWorkReviews(projectId: string): Promise<WorkReviewView[]> {
  const response = await fetch(`/api/studio/v1/collaboration/reviews?projectId=${encodeURIComponent(projectId)}`);
  const data = await readEnvelope(response, "Review listing is unavailable.");
  const items = Array.isArray(data["reviews"]) ? data["reviews"] : [];
  return items.map(parseReview).filter((row): row is WorkReviewView => row !== null);
}

function parseComment(row: unknown): WorkCommentView | null {
  const item = asRecord(row);
  if (!item) return null;
  const commentId = asString(item["commentId"], "");
  if (!commentId) return null;
  const annotation = asRecord(item["annotation"]);
  return {
    commentId,
    authorId: asString(item["authorId"], ""),
    body: asString(item["body"], ""),
    annotation: annotation
      ? {
          assetId: asString(annotation["assetId"], ""),
          x: asNumber(annotation["x"], 0),
          y: asNumber(annotation["y"], 0),
          t: typeof annotation["t"] === "number" ? (annotation["t"] as number) : null,
          label: asNullableString(annotation["label"]),
        }
      : null,
    resolvedAt: asNullableString(item["resolvedAt"]),
    createdAt: asString(item["createdAt"], ""),
  };
}

export async function fetchReviewDetail(
  projectId: string,
  reviewId: string,
): Promise<{ review: WorkReviewView; comments: WorkCommentView[] }> {
  const response = await fetch(
    `/api/studio/v1/collaboration/reviews/${encodeURIComponent(reviewId)}?projectId=${encodeURIComponent(projectId)}`,
  );
  const data = await readEnvelope(response, "Review read failed.");
  const review = parseReview(data["review"]);
  if (!review) throw new WorkApiError("error", "Review read failed.");
  const comments = Array.isArray(data["comments"]) ? data["comments"] : [];
  return {
    review,
    comments: comments.map(parseComment).filter((row): row is WorkCommentView => row !== null),
  };
}

export async function createWorkReview(input: {
  projectId: string;
  title: string;
  pinnedAssets: readonly { assetId: string; version: number | null; contentHash: string | null }[];
  supersedesReviewId?: string | null;
  idempotencyKey: string;
}): Promise<WorkReviewView> {
  const response = await fetch("/api/studio/v1/collaboration/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readEnvelope(response, "Review creation failed.", "review-create");
  const review = parseReview(data["review"]);
  if (!review) throw new WorkApiError("error", "Review creation failed.");
  return review;
}

export async function decideWorkReview(input: {
  projectId: string;
  reviewId: string;
  decision?: "approved" | "changes_requested" | "denied";
  action?: "cancel";
  feedback?: string | null;
}): Promise<WorkReviewView> {
  const response = await fetch(
    `/api/studio/v1/collaboration/reviews/${encodeURIComponent(input.reviewId)}/decide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await readEnvelope(response, "Review decision failed.", "review-decide");
  const review = parseReview(data["review"]);
  if (!review) throw new WorkApiError("error", "Review decision failed.");
  return review;
}

export async function postWorkComment(input: {
  projectId: string;
  reviewId: string;
  body: string;
  annotation?: { assetId: string; x: number; y: number; t?: number | null; label?: string | null } | null;
}): Promise<WorkCommentView> {
  const response = await fetch(
    `/api/studio/v1/collaboration/reviews/${encodeURIComponent(input.reviewId)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await readEnvelope(response, "Comment failed.", "review-comment");
  const comment = parseComment(data["comment"]);
  if (!comment) throw new WorkApiError("error", "Comment failed.");
  return comment;
}

function parseLink(row: unknown): WorkLinkView | null {
  const item = asRecord(row);
  if (!item) return null;
  const linkId = asString(item["linkId"], "");
  if (!linkId) return null;
  return {
    linkId,
    reviewId: asNullableString(item["reviewId"]),
    assetIds: asStringArray(item["assetIds"]),
    note: asString(item["note"], ""),
    expiresAt: asString(item["expiresAt"], ""),
    revokedAt: asNullableString(item["revokedAt"]),
    origin: asString(item["origin"], "collaboration"),
  };
}

export async function fetchReviewLinks(projectId: string, reviewId: string): Promise<WorkLinkView[]> {
  const response = await fetch(
    `/api/studio/v1/collaboration/reviews/${encodeURIComponent(reviewId)}/links?projectId=${encodeURIComponent(projectId)}`,
  );
  const data = await readEnvelope(response, "Link listing is unavailable.");
  const items = Array.isArray(data["links"]) ? data["links"] : [];
  return items.map(parseLink).filter((row): row is WorkLinkView => row !== null);
}

export async function createReviewLink(input: {
  projectId: string;
  reviewId: string;
  assetIds?: readonly string[];
  note?: string;
  ttlMs?: number;
  idempotencyKey: string;
}): Promise<{ link: WorkLinkView; token: string }> {
  const response = await fetch(
    `/api/studio/v1/collaboration/reviews/${encodeURIComponent(input.reviewId)}/links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await readEnvelope(response, "Link creation failed.", "review-link-create");
  const link = parseLink(data["link"]);
  const token = asString(data["token"], "");
  if (!link || !token) throw new WorkApiError("error", "Link creation failed.");
  return { link, token };
}

export async function revokeReviewLink(projectId: string, linkId: string): Promise<void> {
  const response = await fetch(`/api/studio/v1/collaboration/links/${encodeURIComponent(linkId)}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  await readEnvelope(response, "Revocation failed.", "review-link-revoke");
}

function parseJob(row: unknown): WorkJobView | null {
  const item = asRecord(row);
  if (!item) return null;
  const job = asRecord(item["job"]);
  if (!job) return null;
  const jobId = asString(job["jobId"], "");
  if (!jobId) return null;
  const attempts = Array.isArray(item["attempts"]) ? item["attempts"] : [];
  const lastAttempt = attempts.length > 0 ? asRecord(attempts[attempts.length - 1]) : null;
  const receipt = asRecord(item["receipt"]);
  const retry = asRecord(item["retry"]);
  const children = Array.isArray(item["failedChildrenWithCharges"]) ? item["failedChildrenWithCharges"] : [];
  const charged = receipt ? asNumber(receipt["chargedIcu"], 0) : null;
  const childCharged = children.reduce((sum, child) => {
    const record = asRecord(child);
    return sum + (record ? asNumber(record["chargedIcu"], 0) : 0);
  }, 0);
  const status = asString(job["status"], "QUEUED");
  const attemptCount = asNumber(item["attemptCount"], attempts.length);
  const stageLabel = asString(item["stageLabel"], status.toLowerCase());
  const ambiguous = item["ambiguousAttempt"] === true;
  const summaryParts = [
    `${stageLabel}`,
    `${attemptCount} attempt${attemptCount === 1 ? "" : "s"}`,
    charged !== null ? `charged ${(charged + childCharged).toLocaleString()} ICU` : "not yet settled",
  ];
  if (ambiguous) summaryParts.push("ambiguous submit — reconciling");
  return {
    jobId,
    taskName: asString(job["taskName"], asString(job["task"], "job")),
    status,
    stageLabel,
    terminal: item["terminal"] === true,
    attemptCount,
    ambiguousAttempt: ambiguous,
    lastError: lastAttempt ? asNullableString(lastAttempt["lastError"]) : null,
    estimatedIcu: receipt ? asNumber(receipt["estimatedIcu"], 0) : null,
    chargedIcu: charged,
    releasedIcu: receipt ? asNumber(receipt["releasedIcu"], 0) : null,
    reconcilingChildren: asStringArray(item["reconcilingChildren"]),
    failedChildrenWithCharges: children.map((child) => {
      const record = asRecord(child) ?? {};
      return { jobId: asString(record["jobId"], ""), chargedIcu: asNumber(record["chargedIcu"], 0) };
    }),
    totalChargedIcu: asNumber(item["totalChargedIcu"], (charged ?? 0) + childCharged),
    summary: summaryParts.join(" · "),
    retryKind:
      retry && retry["kind"] === "linked_attempt"
        ? "linked_attempt"
        : retry && retry["kind"] === "new_run"
          ? "new_run"
          : "forbidden",
    retryReason: retry ? asString(retry["reason"], "") : "",
    cancellable: item["cancellable"] === true,
    cancelReason: asNullableString(job["cancelReason"]),
    createdAt: asString(job["createdAt"], ""),
    updatedAt: asString(job["updatedAt"], ""),
  };
}

export async function fetchWorkJobs(projectId: string): Promise<WorkJobView[]> {
  const response = await fetch(`/api/studio/v1/collaboration/jobs?projectId=${encodeURIComponent(projectId)}`);
  const data = await readEnvelope(response, "Jobs listing is unavailable.");
  const items = Array.isArray(data["jobs"]) ? data["jobs"] : [];
  return items.map(parseJob).filter((row): row is WorkJobView => row !== null);
}

export async function cancelWorkJob(projectId: string, jobId: string): Promise<void> {
  const response = await fetch(`/api/studio/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  await readEnvelope(response, "Cancellation failed.", "job-cancel");
}

function parseNotification(row: unknown): WorkNotificationView | null {
  const item = asRecord(row);
  if (!item) return null;
  const notificationId = asString(item["notificationId"], "");
  if (!notificationId) return null;
  return {
    notificationId,
    kind: asString(item["kind"], ""),
    title: asString(item["title"], ""),
    body: asString(item["body"], ""),
    href: asNullableString(item["href"]),
    readAt: asNullableString(item["readAt"]),
    createdAt: asString(item["createdAt"], ""),
  };
}

export async function fetchWorkNotifications(
  projectId: string,
): Promise<{ notifications: WorkNotificationView[]; unread: number }> {
  const response = await fetch(`/api/studio/v1/collaboration/notifications?projectId=${encodeURIComponent(projectId)}`);
  const data = await readEnvelope(response, "Notifications are unavailable.");
  const items = Array.isArray(data["notifications"]) ? data["notifications"] : [];
  const notifications = items
    .map(parseNotification)
    .filter((row): row is WorkNotificationView => row !== null);
  return {
    notifications,
    unread: asNumber(data["unread"], notifications.filter((row) => !row.readAt).length),
  };
}

export async function markWorkNotificationRead(projectId: string, notificationId: string): Promise<void> {
  const response = await fetch(
    `/api/studio/v1/collaboration/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    },
  );
  await readEnvelope(response, "Mark-read failed.", "notification-read");
}

/** Human message for a work API failure (permission/setup stay distinct). */
export function workFailureMessage(failure: unknown): string {
  if (failure instanceof WorkApiError) return failure.message;
  return failure instanceof Error ? failure.message : "Request failed.";
}

export function workStateOf(failure: unknown): StudioDataState {
  if (failure instanceof WorkApiError) return failure.state;
  return "error";
}

/** Raw `details.dependency` for setup failures (mapped to a label, never shown). */
export function workDependencyOf(failure: unknown): string | null {
  if (failure instanceof WorkApiError) return failure.dependency;
  return null;
}
