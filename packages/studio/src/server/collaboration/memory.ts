/**
 * Studio V5 collaboration — in-memory ports for tests (STUDIO_18).
 *
 * Scope-pinned maps with the same cross-tenant denials as the SQL layer:
 * reads outside the owning scope throw FORBIDDEN, unknown ids throw
 * NOT_FOUND. Never used outside tests.
 */
import "server-only";
import { collaborationError } from "./types";
import type {
  PlatformRole,
  PublicReviewLink,
  ReviewComment,
  ReviewRequest,
  StudioNotification,
  TruthAttemptRow,
  TruthJobRow,
  TruthReceiptRow,
} from "./types";
import type { ProjectScope } from "../../contracts/scope";
import type { AssetVersionPort, CollaborationStore, JobTruthPort, MembershipPort } from "./ports";

function sameScope(a: ProjectScope, b: ProjectScope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId && a.projectId === b.projectId;
}

function assertScope(scope: ProjectScope, owner: ProjectScope, noun: string): void {
  if (!sameScope(scope, owner)) throw collaborationError("FORBIDDEN", `${noun} belongs to another project scope.`);
}

export interface MemoryCollaborationSeed {
  memberships?: ReadonlyMap<string, PlatformRole>;
  reviewerGrants?: readonly string[];
  assetVersions?: ReadonlyMap<string, { version: number; contentHash: string | null }>;
  jobs?: readonly TruthJobRow[];
  attempts?: ReadonlyMap<string, readonly TruthAttemptRow[]>;
  receipts?: ReadonlyMap<string, TruthReceiptRow>;
  jobStatuses?: ReadonlyMap<string, string>;
}

export function createMemoryCollaboration(seed: MemoryCollaborationSeed = {}): MembershipPort &
  AssetVersionPort &
  JobTruthPort &
  CollaborationStore {
  const memberships = new Map<string, PlatformRole>(seed.memberships ?? []);
  const reviewerGrants = new Set<string>(seed.reviewerGrants ?? []);
  const assetVersions = new Map(seed.assetVersions ?? []);
  const jobs = new Map<string, { scope: ProjectScope; row: TruthJobRow }>();
  const attempts = new Map<string, readonly TruthAttemptRow[]>(seed.attempts ?? []);
  const receipts = new Map<string, TruthReceiptRow>(seed.receipts ?? []);
  const jobStatuses = new Map<string, string>(seed.jobStatuses ?? []);
  const reviews = new Map<string, ReviewRequest>();
  const comments = new Map<string, ReviewComment[]>();
  const links = new Map<string, PublicReviewLink>();
  const notifications = new Map<string, StudioNotification>();

  return {
    async platformRole(_scope: ProjectScope, userId: string): Promise<PlatformRole | null> {
      return memberships.get(userId) ?? null;
    },
    async reviewerGrant(_scope: ProjectScope, userId: string): Promise<boolean> {
      return reviewerGrants.has(userId);
    },
    async currentVersions(
      _scope: ProjectScope,
      assetIds: readonly string[],
    ): Promise<ReadonlyMap<string, { version: number; contentHash: string | null }>> {
      const out = new Map<string, { version: number; contentHash: string | null }>();
      for (const id of assetIds) {
        const current = assetVersions.get(id);
        if (current) out.set(id, current);
      }
      return out;
    },
    __seedJob(scope: ProjectScope, row: TruthJobRow): void {
      jobs.set(row.jobId, { scope, row });
      jobStatuses.set(row.jobId, row.status);
    },
    async listJobs(scope: ProjectScope, limit: number): Promise<readonly TruthJobRow[]> {
      const rows: TruthJobRow[] = [];
      for (const entry of jobs.values()) {
        if (sameScope(scope, entry.scope)) rows.push(entry.row);
      }
      return rows.slice(0, limit);
    },
    async getJob(scope: ProjectScope, jobId: string): Promise<TruthJobRow | null> {
      const entry = jobs.get(jobId);
      if (!entry) return null;
      assertScope(scope, entry.scope, "Job");
      return entry.row;
    },
    async listAttempts(_scope: ProjectScope, jobId: string): Promise<readonly TruthAttemptRow[]> {
      return attempts.get(jobId) ?? [];
    },
    async receiptForJob(_scope: ProjectScope, jobId: string): Promise<TruthReceiptRow | null> {
      for (const receipt of receipts.values()) {
        if (receipt.jobId === jobId) return receipt;
      }
      return null;
    },
    async childReceipts(
      _scope: ProjectScope,
      jobIds: readonly string[],
    ): Promise<ReadonlyMap<string, TruthReceiptRow>> {
      const out = new Map<string, TruthReceiptRow>();
      for (const id of jobIds) {
        for (const receipt of receipts.values()) {
          if (receipt.jobId === id) out.set(id, receipt);
        }
      }
      return out;
    },
    async childStatuses(_scope: ProjectScope, jobIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
      const out = new Map<string, string>();
      for (const id of jobIds) {
        const status = jobStatuses.get(id);
        if (status) out.set(id, status);
      }
      return out;
    },
    async saveReview(review: ReviewRequest): Promise<void> {
      reviews.set(review.reviewId, review);
    },
    async getReview(scope: ProjectScope, reviewId: string): Promise<ReviewRequest> {
      const review = reviews.get(reviewId);
      if (!review) throw collaborationError("NOT_FOUND", "Review was not found.");
      assertScope(scope, review.scope, "Review");
      return review;
    },
    async listReviews(scope: ProjectScope): Promise<readonly ReviewRequest[]> {
      return [...reviews.values()].filter((review) => sameScope(scope, review.scope));
    },
    async saveComment(comment: ReviewComment): Promise<void> {
      const list = comments.get(comment.reviewId) ?? [];
      const index = list.findIndex((row) => row.commentId === comment.commentId);
      if (index >= 0) list[index] = comment;
      else list.push(comment);
      comments.set(comment.reviewId, list);
    },
    async listComments(scope: ProjectScope, reviewId: string): Promise<readonly ReviewComment[]> {
      const review = reviews.get(reviewId);
      if (!review) throw collaborationError("NOT_FOUND", "Review was not found.");
      assertScope(scope, review.scope, "Review");
      return comments.get(reviewId) ?? [];
    },
    async saveLink(link: PublicReviewLink): Promise<void> {
      links.set(link.linkId, link);
    },
    async getLink(scope: ProjectScope, linkId: string): Promise<PublicReviewLink> {
      const link = links.get(linkId);
      if (!link) throw collaborationError("NOT_FOUND", "Link was not found.");
      assertScope(scope, link.scope, "Link");
      return link;
    },
    async listLinks(scope: ProjectScope): Promise<readonly PublicReviewLink[]> {
      return [...links.values()].filter((link) => sameScope(scope, link.scope));
    },
    async linkCandidates(): Promise<readonly PublicReviewLink[]> {
      // Memory store: tests pass the full candidate set; SQL narrows by hash.
      return [...links.values()];
    },
    async grantReviewer(_scope: ProjectScope, userId: string): Promise<void> {
      reviewerGrants.add(userId);
    },
    async revokeReviewer(_scope: ProjectScope, userId: string): Promise<void> {
      reviewerGrants.delete(userId);
    },
    async saveNotification(notification: StudioNotification): Promise<void> {
      // Dedupe: one unread row per (user, key) per scope. A save for an
      // id already stored is an update (mark-read), never a duplicate.
      for (const row of notifications.values()) {
        if (
          row.notificationId !== notification.notificationId &&
          row.userId === notification.userId &&
          row.dedupeKey === notification.dedupeKey &&
          !row.readAt &&
          sameScope(row.scope, notification.scope)
        ) {
          return;
        }
      }
      notifications.set(notification.notificationId, notification);
    },
    async listNotifications(scope: ProjectScope, userId: string): Promise<readonly StudioNotification[]> {
      return [...notifications.values()].filter(
        (row) => row.userId === userId && sameScope(scope, row.scope),
      );
    },
  } as MembershipPort & AssetVersionPort & JobTruthPort & CollaborationStore & {
    __seedJob(scope: ProjectScope, row: TruthJobRow): void;
  };
}
