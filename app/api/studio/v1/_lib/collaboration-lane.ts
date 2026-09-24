import "server-only";

/**
 * P03 — fixture-lane collaboration repository (RC-3/RC-10).
 *
 * Mirrors the `supabase-collaboration.ts` shapes the routes consume, backed
 * by `localStores().collaboration` (the kernel memory store, never a
 * rewrite). Routes branch onto these functions only when
 * `isStudioFixtureLane()` holds. Asset-version snapshots come from the
 * local asset lane (passed in by routes); idempotency replay for reviews
 * and links is first-write-wins per (scope, key). Jobs truth projects
 * from the SAME fixture runtime store `jobs/route.ts` admits into.
 */
import type { ProjectScope } from "@ethen/studio-core/contracts";
import {
  CollaborationError,
  createMemoryCollaboration,
  projectJobTruth,
  type CollaborationStore,
  type JobTruthView,
  type PublicReviewLink,
  type ReviewComment,
  type ReviewRequest,
  type StudioNotification,
  type TruthAttemptRow,
  type TruthJobRow,
  type TruthReceiptRow,
} from "@ethen/studio-core/server/collaboration";
import type { FixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";
import type {
  RuntimeAttempt,
  RuntimeJob,
} from "@ethen/studio-core/server/runtime";
import type { SettlementReceipt } from "@ethen/studio-core/server/economics";

export type FixtureCollaborationStore = ReturnType<typeof createMemoryCollaboration>;

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
}

function scopeKey(scope: ProjectScope): string {
  return `${String(scope.tenantId)}:${String(scope.workspaceId)}:${String(scope.projectId)}`;
}

/** Lane idempotency index (first-write-wins per scope + key). Lives in `localStores().keys`. */
export interface FixtureLaneKeys {
  reviews: Map<string, string>;
  links: Map<string, string>;
}

// ------------------------------------------------------------------- reviews

export async function fixtureListReviews(
  store: CollaborationStore,
  scope: FixtureScope,
): Promise<ReviewRequest[]> {
  return [...(await store.listReviews(scope.scope))];
}

export async function fixtureGetReview(
  store: CollaborationStore,
  scope: FixtureScope,
  reviewId: string,
): Promise<ReviewRequest | null> {
  try {
    return await store.getReview(scope.scope, reviewId);
  } catch (error) {
    if (error instanceof CollaborationError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export async function fixtureInsertReview(
  store: CollaborationStore,
  keys: FixtureLaneKeys,
  scope: FixtureScope,
  review: ReviewRequest,
  idempotencyKey: string,
): Promise<ReviewRequest> {
  const seen = keys.reviews.get(`${scopeKey(scope.scope)}:${idempotencyKey}`);
  if (seen) {
    const existing = await fixtureGetReview(store, scope, seen);
    if (existing) return existing;
  }
  await store.saveReview(review);
  keys.reviews.set(`${scopeKey(scope.scope)}:${idempotencyKey}`, review.reviewId);
  return review;
}

export async function fixtureUpdateReview(store: CollaborationStore, review: ReviewRequest): Promise<void> {
  await store.saveReview(review);
}

// ------------------------------------------------------------------ comments

export async function fixtureListComments(
  store: CollaborationStore,
  scope: FixtureScope,
  reviewId: string,
): Promise<ReviewComment[]> {
  try {
    return [...(await store.listComments(scope.scope, reviewId))];
  } catch (error) {
    if (error instanceof CollaborationError && error.code === "NOT_FOUND") return [];
    throw error;
  }
}

export async function fixtureInsertComment(store: CollaborationStore, comment: ReviewComment): Promise<void> {
  await store.saveComment(comment);
}

// --------------------------------------------------------------------- links

export async function fixtureListLinks(
  store: CollaborationStore,
  scope: FixtureScope,
): Promise<PublicReviewLink[]> {
  return [...(await store.listLinks(scope.scope))];
}

export async function fixtureInsertLink(
  store: CollaborationStore,
  keys: FixtureLaneKeys,
  scope: FixtureScope,
  link: PublicReviewLink,
  idempotencyKey: string,
): Promise<PublicReviewLink> {
  const seen = keys.links.get(`${scopeKey(scope.scope)}:${idempotencyKey}`);
  if (seen) {
    try {
      return await store.getLink(scope.scope, seen);
    } catch {
      // Stale index entry: fall through and save fresh.
    }
  }
  await store.saveLink(link);
  keys.links.set(`${scopeKey(scope.scope)}:${idempotencyKey}`, link.linkId);
  return link;
}

export async function fixtureRevokeLink(
  store: CollaborationStore,
  scope: FixtureScope,
  linkId: string,
  revokedAt: string,
): Promise<boolean> {
  try {
    const link = await store.getLink(scope.scope, linkId);
    await store.saveLink({ ...link, revokedAt });
    return true;
  } catch (error) {
    if (error instanceof CollaborationError && error.code === "NOT_FOUND") return false;
    throw error;
  }
}

// ------------------------------------------------------------- notifications

export async function fixtureListNotifications(
  store: CollaborationStore,
  scope: FixtureScope,
  userId: string,
): Promise<StudioNotification[]> {
  return [...(await store.listNotifications(scope.scope, userId))];
}

export async function fixtureInsertNotification(
  store: CollaborationStore,
  notification: StudioNotification,
): Promise<void> {
  await store.saveNotification(notification);
}

export async function fixtureMarkNotificationRead(
  store: CollaborationStore,
  scope: FixtureScope,
  userId: string,
  notificationId: string,
  readAt: string,
): Promise<boolean> {
  const mine = (await store.listNotifications(scope.scope, userId)).find(
    (row) => row.notificationId === notificationId,
  );
  if (!mine) return false;
  await store.saveNotification({ ...mine, readAt });
  return true;
}

// ----------------------------------------------------------------- reviewers

export async function fixtureGrantReviewer(
  store: FixtureCollaborationStore,
  scope: FixtureScope,
  userId: string,
  grantedBy: string,
): Promise<void> {
  await store.grantReviewer(scope.scope, userId, grantedBy);
}

export async function fixtureRevokeReviewer(
  store: FixtureCollaborationStore,
  scope: FixtureScope,
  userId: string,
): Promise<void> {
  await store.revokeReviewer(scope.scope, userId);
}

// ------------------------------------------------------------ asset versions

export type AssetVersionSnapshot = ReadonlyMap<string, { version: number; contentHash: string | null }>;

export interface AssetDetailLike {
  latestVersion: number;
  versions: readonly { version: number; sha256: string }[];
}

/** Build a snapshot through a caller-supplied asset loader (local lane). */
export async function fixtureSnapshotFor(
  load: (assetId: string) => Promise<AssetDetailLike | null>,
  assetIds: readonly string[],
): Promise<AssetVersionSnapshot> {
  const out = new Map<string, { version: number; contentHash: string | null }>();
  for (const id of new Set(assetIds)) {
    const detail = await load(id).catch(() => null);
    if (!detail || detail.latestVersion <= 0) continue;
    out.set(id, { version: detail.latestVersion, contentHash: detail.versions[0]?.sha256 ?? null });
  }
  return out;
}

/** Narrow a local-asset snapshot to the pinned ids (routes build it). */
export function fixtureCurrentVersions(
  snapshot: AssetVersionSnapshot,
  assetIds: readonly string[],
): AssetVersionSnapshot {
  const out = new Map<string, { version: number; contentHash: string | null }>();
  for (const id of assetIds) {
    const current = snapshot.get(id);
    if (current) out.set(id, current);
  }
  return out;
}

// ---------------------------------------------------------------- jobs truth
// Read-only projection over the fixture runtime + economics memory
// stores — the same source `jobs/route.ts` admits into.

function toTruthJob(job: RuntimeJob): TruthJobRow {
  return {
    jobId: job.jobId,
    taskName: job.task,
    status: job.status,
    quoteId: job.quoteId,
    reservationId: job.reservationId,
    endpointId: job.endpointId,
    cancelReason: job.cancelReason,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toTruthAttempt(attempt: RuntimeAttempt): TruthAttemptRow {
  return {
    attemptId: attempt.attemptId,
    attemptNumber: attempt.attemptNumber,
    phase: attempt.phase,
    status: attempt.status,
    submitAmbiguous: attempt.submitAmbiguous,
    lastError: attempt.lastError,
    createdAt: attempt.createdAt,
  };
}

function toTruthReceipt(receipt: SettlementReceipt): TruthReceiptRow {
  return {
    receiptId: receipt.receiptId,
    reservationId: receipt.reservationId,
    jobId: receipt.jobId,
    estimatedIcu: Number(receipt.estimatedIcu),
    chargedIcu: Number(receipt.chargedIcu),
    releasedIcu: Number(receipt.releasedIcu),
    absorbedProviderIcu: Number(receipt.absorbedProviderIcu),
    reconcilingChildren: [...receipt.reconcilingChildren],
    settledAt: receipt.settledAt,
  };
}

async function fixtureChildren(
  lane: Pick<FixtureLane, "runtime" | "economics">,
  scope: ProjectScope,
  jobIds: readonly string[],
): Promise<{ receipts: ReadonlyMap<string, TruthReceiptRow>; statuses: ReadonlyMap<string, string> }> {
  const receipts = new Map<string, TruthReceiptRow>();
  const statuses = new Map<string, string>();
  for (const jobId of jobIds) {
    const job = await lane.runtime.get(jobId, scope);
    if (!job) continue;
    statuses.set(jobId, job.status);
    if (!job.reservationId) continue;
    const receipt = lane.economics.getReceiptForReservation(job.reservationId);
    if (receipt?.jobId) receipts.set(receipt.jobId, toTruthReceipt(receipt));
  }
  return { receipts, statuses };
}

async function projectFixtureJob(
  lane: Pick<FixtureLane, "runtime" | "economics">,
  scope: ProjectScope,
  job: RuntimeJob,
): Promise<JobTruthView> {
  const attempts = await lane.runtime.listAttempts(job.jobId, scope);
  const settled = job.reservationId ? lane.economics.getReceiptForReservation(job.reservationId) : null;
  const receipt = settled ? toTruthReceipt(settled) : null;
  const children = receipt ? await fixtureChildren(lane, scope, receipt.reconcilingChildren) : null;
  return projectJobTruth({
    job: toTruthJob(job),
    attempts: attempts.map(toTruthAttempt),
    receipt,
    childReceipts: children?.receipts,
    childStatuses: children?.statuses,
  });
}

/** Newest-first truth views for the fixture jobs in scope (History). */
export async function fixtureListJobTruth(
  lane: Pick<FixtureLane, "runtime" | "economics">,
  scope: ProjectScope,
  projectId: string,
  limit: number,
): Promise<JobTruthView[]> {
  const jobs = await lane.runtime.listJobs(projectId, undefined, Math.min(Math.max(limit, 1), 50));
  const views: JobTruthView[] = [];
  for (const job of jobs) {
    views.push(await projectFixtureJob(lane, scope, job));
  }
  return views;
}

/** Truth view for one fixture job, or null when outside this scope. */
export async function fixtureGetJobTruth(
  lane: Pick<FixtureLane, "runtime" | "economics">,
  scope: ProjectScope,
  jobId: string,
): Promise<JobTruthView | null> {
  const job = await lane.runtime.get(jobId, scope);
  if (!job) return null;
  return projectFixtureJob(lane, scope, job);
}
