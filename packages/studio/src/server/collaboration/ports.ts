/**
 * Studio V5 collaboration — ports over published contracts (STUDIO_18).
 *
 * Membership reads Platform project_members; asset versions read the j02
 * durable asset store; jobs/receipts read j05/j04. The kernel owns the
 * policy (roles, validity, retry); ports only fetch facts.
 */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
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

export interface MembershipPort {
  /** Platform role of a user in a project, or null when not a member. */
  platformRole(scope: ProjectScope, userId: string): Promise<PlatformRole | null>;
  /** True when the user holds a j18 reviewer grant in the project. */
  reviewerGrant(scope: ProjectScope, userId: string): Promise<boolean>;
}

export interface AssetVersionPort {
  /** Current (version, content hash) per asset id; missing ids absent. */
  currentVersions(
    scope: ProjectScope,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, { version: number; contentHash: string | null }>>;
}

export interface JobTruthPort {
  listJobs(scope: ProjectScope, limit: number): Promise<readonly TruthJobRow[]>;
  getJob(scope: ProjectScope, jobId: string): Promise<TruthJobRow | null>;
  listAttempts(scope: ProjectScope, jobId: string): Promise<readonly TruthAttemptRow[]>;
  receiptForJob(scope: ProjectScope, jobId: string): Promise<TruthReceiptRow | null>;
  childReceipts(scope: ProjectScope, jobIds: readonly string[]): Promise<ReadonlyMap<string, TruthReceiptRow>>;
  childStatuses(scope: ProjectScope, jobIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export interface CollaborationStore {
  saveReview(review: ReviewRequest): Promise<void>;
  getReview(scope: ProjectScope, reviewId: string): Promise<ReviewRequest>;
  listReviews(scope: ProjectScope): Promise<readonly ReviewRequest[]>;
  saveComment(comment: ReviewComment): Promise<void>;
  listComments(scope: ProjectScope, reviewId: string): Promise<readonly ReviewComment[]>;
  saveLink(link: PublicReviewLink): Promise<void>;
  getLink(scope: ProjectScope, linkId: string): Promise<PublicReviewLink>;
  listLinks(scope: ProjectScope): Promise<readonly PublicReviewLink[]>;
  linkCandidates(tokenHashPrefix: string): Promise<readonly PublicReviewLink[]>;
  grantReviewer(scope: ProjectScope, userId: string, grantedBy: string): Promise<void>;
  revokeReviewer(scope: ProjectScope, userId: string): Promise<void>;
  saveNotification(notification: StudioNotification): Promise<void>;
  listNotifications(scope: ProjectScope, userId: string): Promise<readonly StudioNotification[]>;
}
