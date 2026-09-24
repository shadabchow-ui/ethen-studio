import "server-only";

/**
 * STUDIO_18 route-adapter collaboration access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed review/comment/link/notification access over the j18
 * schema plus read-only jobs-truth projection over j05 jobs/attempts and
 * j04 receipts. Service-role bypasses RLS, so every call binds explicit
 * project scope. Membership reads Platform project_members; reviewer
 * grants are a j18 mapping on top, never a substitute.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { CollaborationError } from "@ethen/studio-core/server/collaboration";
import type {
  PlatformRole,
  PinnedAssetVersion,
  PublicReviewLink,
  ReviewComment,
  ReviewRequest,
  StudioNotification,
  TruthAttemptRow,
  TruthJobRow,
  TruthReceiptRow,
} from "@ethen/studio-core/server/collaboration";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function jsonArray(row: Row, key: string): unknown[] {
  const value = row[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function iso(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

// ---------------------------------------------------------------- membership

const PLATFORM_ROLES: readonly PlatformRole[] = ["owner", "admin", "member", "viewer"];

/** Platform role of a user in a project, or null when not a member. */
export async function platformRoleFor(projectId: string, userId: string): Promise<PlatformRole | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new CollaborationError("INTERNAL", `Failed to read membership: ${error.message}`);
  if (!data) return null;
  const role = str(data as Row, "role") as PlatformRole;
  return PLATFORM_ROLES.includes(role) ? role : null;
}

/** True when the user holds a j18 reviewer grant in the project. */
export async function reviewerGrantFor(scope: ResolvedScope, userId: string): Promise<boolean> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_reviewer_grants")
    .select("user_id")
    .eq("project_id", scope.projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new CollaborationError("INTERNAL", `Failed to read reviewer grants: ${error.message}`);
  return Boolean(data);
}

export async function grantReviewer(scope: ResolvedScope, userId: string, grantedBy: string): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client
    .from("studio_v5_reviewer_grants")
    .upsert({ project_id: scope.projectId, user_id: userId, granted_by: grantedBy });
  if (error) throw new CollaborationError("INTERNAL", `Failed to grant reviewer: ${error.message}`);
}

export async function revokeReviewer(scope: ResolvedScope, userId: string): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client
    .from("studio_v5_reviewer_grants")
    .delete()
    .eq("project_id", scope.projectId)
    .eq("user_id", userId);
  if (error) throw new CollaborationError("INTERNAL", `Failed to revoke reviewer: ${error.message}`);
}

// ------------------------------------------------------------ asset versions

/** Current (version, sha256) per asset id from the j02 version store. */
export async function currentAssetVersions(
  scope: ResolvedScope,
  assetIds: readonly string[],
): Promise<ReadonlyMap<string, { version: number; contentHash: string | null }>> {
  const out = new Map<string, { version: number; contentHash: string | null }>();
  if (assetIds.length === 0) return out;
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_asset_versions")
    .select("asset_id, version, sha256")
    .eq("project_id", scope.projectId)
    .in("asset_id", [...assetIds])
    .order("version", { ascending: false });
  if (error) throw new CollaborationError("INTERNAL", `Failed to read asset versions: ${error.message}`);
  for (const raw of (data ?? []) as Row[]) {
    const id = str(raw, "asset_id");
    if (!out.has(id)) out.set(id, { version: int(raw, "version"), contentHash: nullableStr(raw, "sha256") });
  }
  return out;
}

// ------------------------------------------------------------------- reviews

const REVIEW_SELECT =
  "review_id,title,status,request_version,pinned_assets,requested_by,decided_by,feedback,supersedes_review_id,expires_at,created_at,updated_at";

function toPins(value: unknown): PinnedAssetVersion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((pin): pin is Record<string, unknown> => Boolean(pin) && typeof pin === "object")
    .map((pin) => ({
      assetId: String(pin["assetId"] ?? ""),
      version: typeof pin["version"] === "number" ? (pin["version"] as number) : null,
      contentHash: typeof pin["contentHash"] === "string" ? (pin["contentHash"] as string) : null,
    }));
}

function toReview(scope: ResolvedScope, row: Row): ReviewRequest {
  const rawPins = row["pinned_assets"];
  const pins = Array.isArray(rawPins) ? rawPins : jsonArray(row, "pinned_assets");
  return {
    reviewId: str(row, "review_id"),
    scope: scope.scope,
    title: str(row, "title"),
    status: str(row, "status") as ReviewRequest["status"],
    requestVersion: int(row, "request_version") || 1,
    pinnedAssets: toPins(pins),
    requestedBy: str(row, "requested_by"),
    decidedBy: nullableStr(row, "decided_by"),
    feedback: nullableStr(row, "feedback"),
    supersedesReviewId: nullableStr(row, "supersedes_review_id"),
    expiresAt: nullableStr(row, "expires_at"),
    createdAt: iso(row["created_at"]),
    updatedAt: iso(row["updated_at"]),
  };
}

export async function listReviews(scope: ResolvedScope): Promise<ReviewRequest[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_review_requests")
    .select(REVIEW_SELECT)
    .eq("project_id", scope.projectId)
    .eq("tenant_id", scope.tenantId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new CollaborationError("INTERNAL", `Failed to list reviews: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toReview(scope, row));
}

export async function getReview(scope: ResolvedScope, reviewId: string): Promise<ReviewRequest | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_review_requests")
    .select(REVIEW_SELECT)
    .eq("review_id", reviewId)
    .eq("project_id", scope.projectId)
    .maybeSingle();
  if (error) throw new CollaborationError("INTERNAL", `Failed to read review: ${error.message}`);
  return data ? toReview(scope, data as Row) : null;
}

export async function insertReview(input: {
  scope: ResolvedScope;
  review: ReviewRequest;
  idempotencyKey: string;
}): Promise<ReviewRequest> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_review_requests")
    .upsert(
      {
        review_id: input.review.reviewId,
        tenant_id: input.scope.tenantId,
        project_id: input.scope.projectId,
        title: input.review.title,
        status: input.review.status,
        request_version: input.review.requestVersion,
        pinned_assets: input.review.pinnedAssets,
        requested_by: input.review.requestedBy,
        decided_by: input.review.decidedBy,
        feedback: input.review.feedback,
        supersedes_review_id: input.review.supersedesReviewId,
        expires_at: input.review.expiresAt,
        idempotency_key: input.idempotencyKey,
      },
      { onConflict: "project_id,idempotency_key" },
    )
    .select(REVIEW_SELECT)
    .single();
  if (error) throw new CollaborationError("INTERNAL", `Failed to save review: ${error.message}`);
  return toReview(input.scope, data as Row);
}

export async function updateReview(input: { scope: ResolvedScope; review: ReviewRequest }): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client
    .from("studio_v5_review_requests")
    .update({
      status: input.review.status,
      decided_by: input.review.decidedBy,
      feedback: input.review.feedback,
      updated_at: input.review.updatedAt,
    })
    .eq("review_id", input.review.reviewId)
    .eq("project_id", input.scope.projectId);
  if (error) throw new CollaborationError("INTERNAL", `Failed to update review: ${error.message}`);
}

// ------------------------------------------------------------------ comments

const COMMENT_SELECT = "comment_id,review_id,author_id,body,annotation,resolved_at,created_at";

function toComment(scope: ResolvedScope, row: Row): ReviewComment {
  const annotation = row["annotation"] as Record<string, unknown> | null;
  return {
    commentId: str(row, "comment_id"),
    reviewId: str(row, "review_id"),
    scope: scope.scope,
    authorId: str(row, "author_id"),
    body: str(row, "body"),
    annotation:
      annotation && typeof annotation === "object"
        ? {
            assetId: String(annotation["assetId"] ?? ""),
            x: Number(annotation["x"] ?? 0),
            y: Number(annotation["y"] ?? 0),
            t: typeof annotation["t"] === "number" ? (annotation["t"] as number) : null,
            label: typeof annotation["label"] === "string" ? (annotation["label"] as string) : null,
          }
        : null,
    resolvedAt: nullableStr(row, "resolved_at"),
    createdAt: iso(row["created_at"]),
  };
}

export async function listComments(scope: ResolvedScope, reviewId: string): Promise<ReviewComment[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_review_comments")
    .select(COMMENT_SELECT)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new CollaborationError("INTERNAL", `Failed to list comments: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toComment(scope, row));
}

export async function insertComment(input: { scope: ResolvedScope; comment: ReviewComment }): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_review_comments").insert({
    comment_id: input.comment.commentId,
    review_id: input.comment.reviewId,
    author_id: input.comment.authorId,
    body: input.comment.body,
    annotation: input.comment.annotation,
  });
  if (error) throw new CollaborationError("INTERNAL", `Failed to save comment: ${error.message}`);
}

export async function resolveCommentRow(
  scope: ResolvedScope,
  reviewId: string,
  commentId: string,
  resolvedAt: string,
): Promise<void> {
  const client = requireServiceClient();
  const { data: review } = await client
    .from("studio_v5_review_requests")
    .select("review_id")
    .eq("review_id", reviewId)
    .eq("project_id", scope.projectId)
    .maybeSingle();
  if (!review) throw new CollaborationError("NOT_FOUND", "Review was not found in this project.");
  const { error } = await client
    .from("studio_v5_review_comments")
    .update({ resolved_at: resolvedAt })
    .eq("comment_id", commentId)
    .eq("review_id", reviewId);
  if (error) throw new CollaborationError("INTERNAL", `Failed to resolve comment: ${error.message}`);
}

// --------------------------------------------------------------------- links

const LINK_SELECT =
  "link_id,review_id,token_hash,asset_ids,note,expires_at,revoked_at,created_by,origin,legacy_link_id,created_at";

function toLink(scope: ResolvedScope, row: Row): PublicReviewLink {
  return {
    linkId: str(row, "link_id"),
    scope: scope.scope,
    reviewId: nullableStr(row, "review_id"),
    tokenHash: str(row, "token_hash"),
    assetIds: strArray(row, "asset_ids"),
    note: str(row, "note"),
    expiresAt: iso(row["expires_at"]),
    revokedAt: nullableStr(row, "revoked_at"),
    createdBy: str(row, "created_by"),
    origin: (str(row, "origin") || "collaboration") as PublicReviewLink["origin"],
    legacyLinkId: nullableStr(row, "legacy_link_id"),
    createdAt: iso(row["created_at"]),
  };
}

/** Links redacted for list views (hash never leaves the server). */
export function redactLink(link: PublicReviewLink): Omit<PublicReviewLink, "tokenHash" | "scope"> & {
  projectId: string;
} {
  return {
    linkId: link.linkId,
    projectId: link.scope.projectId as string,
    reviewId: link.reviewId,
    assetIds: link.assetIds,
    note: link.note,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    createdBy: link.createdBy,
    origin: link.origin,
    legacyLinkId: link.legacyLinkId,
    createdAt: link.createdAt,
  };
}

export async function listLinks(scope: ResolvedScope): Promise<PublicReviewLink[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_public_review_links")
    .select(LINK_SELECT)
    .eq("project_id", scope.projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new CollaborationError("INTERNAL", `Failed to list links: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toLink(scope, row));
}

export async function insertLink(input: {
  scope: ResolvedScope;
  link: PublicReviewLink;
  idempotencyKey: string;
}): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_public_review_links").insert({
    tenant_id: input.scope.tenantId,
    project_id: input.scope.projectId,
    review_id: input.link.reviewId,
    token_hash: input.link.tokenHash,
    asset_ids: [...input.link.assetIds],
    note: input.link.note,
    expires_at: input.link.expiresAt,
    created_by: input.link.createdBy,
    origin: input.link.origin,
    idempotency_key: input.idempotencyKey,
  });
  if (error) throw new CollaborationError("INTERNAL", `Failed to save link: ${error.message}`);
}

export async function revokeLinkRow(scope: ResolvedScope, linkId: string, revokedAt: string): Promise<boolean> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_public_review_links")
    .update({ revoked_at: revokedAt })
    .eq("link_id", linkId)
    .eq("project_id", scope.projectId)
    .select("link_id");
  if (error) throw new CollaborationError("INTERNAL", `Failed to revoke link: ${error.message}`);
  return ((data ?? []) as Row[]).length > 0;
}

/** Exact-hash lookup for public resolution (no prefix scan, no enumeration). */
export async function linkByTokenHash(tokenHash: string): Promise<{ link: PublicReviewLink; scope: ResolvedScope } | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_public_review_links")
    .select("link_id,tenant_id,project_id,review_id,token_hash,asset_ids,note,expires_at,revoked_at,created_by,origin,legacy_link_id,created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new CollaborationError("INTERNAL", `Failed to resolve link: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const projectId = str(row, "project_id");
  const { resolveProjectScope } = await import("./supabase-data");
  const resolved = await resolveProjectScope(projectId);
  if (!resolved) return null;
  return { link: toLink(resolved, row), scope: resolved };
}

// ------------------------------------------------------------- notifications

const NOTIFICATION_SELECT =
  "notification_id,user_id,kind,dedupe_key,title,body,href,read_at,created_at";

function toNotification(scope: ResolvedScope, row: Row): StudioNotification {
  return {
    notificationId: str(row, "notification_id"),
    scope: scope.scope,
    userId: str(row, "user_id"),
    kind: str(row, "kind") as StudioNotification["kind"],
    dedupeKey: str(row, "dedupe_key"),
    title: str(row, "title"),
    body: str(row, "body"),
    href: nullableStr(row, "href"),
    readAt: nullableStr(row, "read_at"),
    createdAt: iso(row["created_at"]),
  };
}

export async function listNotifications(scope: ResolvedScope, userId: string): Promise<StudioNotification[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_notifications")
    .select(NOTIFICATION_SELECT)
    .eq("project_id", scope.projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new CollaborationError("INTERNAL", `Failed to list notifications: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => toNotification(scope, row));
}

export async function insertNotification(input: {
  scope: ResolvedScope;
  notification: StudioNotification;
}): Promise<boolean> {
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_notifications").insert({
    notification_id: input.notification.notificationId,
    tenant_id: input.scope.tenantId,
    project_id: input.scope.projectId,
    user_id: input.notification.userId,
    kind: input.notification.kind,
    dedupe_key: input.notification.dedupeKey,
    title: input.notification.title,
    body: input.notification.body,
    href: input.notification.href,
  });
  if (error) {
    // Unread-dedupe conflict collapses silently: the unread row already exists.
    if (/duplicate|unique/i.test(error.message)) return false;
    throw new CollaborationError("INTERNAL", `Failed to save notification: ${error.message}`);
  }
  return true;
}

export async function markNotificationRead(
  scope: ResolvedScope,
  userId: string,
  notificationId: string,
  readAt: string,
): Promise<boolean> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_notifications")
    .update({ read_at: readAt })
    .eq("notification_id", notificationId)
    .eq("project_id", scope.projectId)
    .eq("user_id", userId)
    .select("notification_id");
  if (error) throw new CollaborationError("INTERNAL", `Failed to mark notification: ${error.message}`);
  return ((data ?? []) as Row[]).length > 0;
}

// ---------------------------------------------------------------- jobs truth
// Read-only projection over j05 jobs/attempts and j04 receipts. No writes.

const JOB_SELECT =
  "job_id,task_name,status,quote_id,reservation_id,endpoint_id,cancel_reason,created_at,updated_at";

function toTruthJob(row: Row): TruthJobRow {
  return {
    jobId: str(row, "job_id"),
    taskName: str(row, "task_name"),
    status: str(row, "status"),
    quoteId: str(row, "quote_id"),
    reservationId: nullableStr(row, "reservation_id"),
    endpointId: str(row, "endpoint_id"),
    cancelReason: nullableStr(row, "cancel_reason"),
    createdAt: iso(row["created_at"]),
    updatedAt: iso(row["updated_at"]),
  };
}

function toTruthAttempt(row: Row): TruthAttemptRow {
  return {
    attemptId: str(row, "attempt_id"),
    attemptNumber: int(row, "attempt_number"),
    phase: str(row, "phase"),
    status: str(row, "status"),
    submitAmbiguous: row["submit_ambiguous"] === true,
    lastError: nullableStr(row, "last_error"),
    createdAt: iso(row["created_at"]),
  };
}

function toTruthReceipt(row: Row): TruthReceiptRow {
  return {
    receiptId: str(row, "receipt_id"),
    reservationId: str(row, "reservation_id"),
    jobId: nullableStr(row, "job_id"),
    estimatedIcu: int(row, "estimated_icu"),
    chargedIcu: int(row, "charged_icu"),
    releasedIcu: int(row, "released_icu"),
    absorbedProviderIcu: int(row, "absorbed_provider_icu"),
    reconcilingChildren: strArray(row, "reconciling_children"),
    settledAt: iso(row["settled_at"]),
  };
}

export async function listTruthJobs(scope: ResolvedScope, limit: number): Promise<TruthJobRow[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_jobs")
    .select(JOB_SELECT)
    .eq("project_id", scope.projectId)
    .eq("tenant_id", scope.tenantId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new CollaborationError("INTERNAL", `Failed to list jobs: ${error.message}`);
  return ((data ?? []) as Row[]).map(toTruthJob);
}

export async function getTruthJob(scope: ResolvedScope, jobId: string): Promise<TruthJobRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_jobs")
    .select(JOB_SELECT)
    .eq("job_id", jobId)
    .eq("project_id", scope.projectId)
    .maybeSingle();
  if (error) throw new CollaborationError("INTERNAL", `Failed to read job: ${error.message}`);
  return data ? toTruthJob(data as Row) : null;
}

export async function listTruthAttempts(scope: ResolvedScope, jobId: string): Promise<TruthAttemptRow[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_attempts")
    .select("attempt_id,attempt_number,phase,status,submit_ambiguous,last_error,created_at")
    .eq("job_id", jobId)
    .eq("project_id", scope.projectId)
    .order("attempt_number", { ascending: true });
  if (error) throw new CollaborationError("INTERNAL", `Failed to list attempts: ${error.message}`);
  return ((data ?? []) as Row[]).map(toTruthAttempt);
}

export async function receiptForTruthJob(scope: ResolvedScope, jobId: string): Promise<TruthReceiptRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_receipts")
    .select(
      "receipt_id,reservation_id,job_id,estimated_icu,charged_icu,released_icu,absorbed_provider_icu,reconciling_children,settled_at",
    )
    .eq("job_id", jobId)
    .eq("project_id", scope.projectId)
    .maybeSingle();
  if (error) throw new CollaborationError("INTERNAL", `Failed to read receipt: ${error.message}`);
  return data ? toTruthReceipt(data as Row) : null;
}

export async function truthChildren(
  scope: ResolvedScope,
  jobIds: readonly string[],
): Promise<{ receipts: ReadonlyMap<string, TruthReceiptRow>; statuses: ReadonlyMap<string, string> }> {
  const receipts = new Map<string, TruthReceiptRow>();
  const statuses = new Map<string, string>();
  if (jobIds.length === 0) return { receipts, statuses };
  const client = requireServiceClient();
  const { data: jobs, error: jobError } = await client
    .from("studio_v5_jobs")
    .select("job_id,status")
    .in("job_id", [...jobIds])
    .eq("project_id", scope.projectId);
  if (jobError) throw new CollaborationError("INTERNAL", `Failed to read child jobs: ${jobError.message}`);
  for (const row of (jobs ?? []) as Row[]) statuses.set(str(row, "job_id"), str(row, "status"));
  const { data: rows, error } = await client
    .from("studio_v5_receipts")
    .select(
      "receipt_id,reservation_id,job_id,estimated_icu,charged_icu,released_icu,absorbed_provider_icu,reconciling_children,settled_at",
    )
    .in("job_id", [...jobIds])
    .eq("project_id", scope.projectId);
  if (error) throw new CollaborationError("INTERNAL", `Failed to read child receipts: ${error.message}`);
  for (const row of (rows ?? []) as Row[]) {
    const receipt = toTruthReceipt(row);
    if (receipt.jobId) receipts.set(receipt.jobId, receipt);
  }
  return { receipts, statuses };
}
