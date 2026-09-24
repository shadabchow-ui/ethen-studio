/**
 * STUDIO_18 — work library view contracts (browser-safe).
 *
 * Projects/assets libraries over the shared StudioLibraryFrame; jobs
 * truth over the canonical read model; review/comment/annotation;
 * notification center. States reuse the shell StudioDataState.
 */
import type { StudioDataState } from "../shell/types";

export interface WorkProjectView {
  projectId: string;
  name: string;
  revision: number;
  assetCount?: number;
}

export interface WorkAssetView {
  assetId: string;
  filename: string;
  kind: string;
  revision: number;
  latestVersion: number;
  createdAt: string;
}

export interface WorkJobView {
  jobId: string;
  taskName: string;
  status: string;
  stageLabel: string;
  terminal: boolean;
  attemptCount: number;
  ambiguousAttempt: boolean;
  lastError: string | null;
  estimatedIcu: number | null;
  chargedIcu: number | null;
  releasedIcu: number | null;
  reconcilingChildren: readonly string[];
  failedChildrenWithCharges: readonly { jobId: string; chargedIcu: number }[];
  totalChargedIcu: number;
  summary: string;
  retryKind: "linked_attempt" | "new_run" | "forbidden";
  retryReason: string;
  cancellable: boolean;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkReviewView {
  reviewId: string;
  title: string;
  status: string;
  statusLabel: string;
  pinnedAssets: readonly { assetId: string; version: number | null; contentHash: string | null }[];
  requestedBy: string;
  decidedBy: string | null;
  feedback: string | null;
  valid: boolean;
  validityReason: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export interface WorkCommentView {
  commentId: string;
  authorId: string;
  body: string;
  annotation: {
    assetId: string;
    x: number;
    y: number;
    t: number | null;
    label: string | null;
  } | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface WorkLinkView {
  linkId: string;
  reviewId: string | null;
  assetIds: readonly string[];
  note: string;
  expiresAt: string;
  revokedAt: string | null;
  origin: string;
}

export interface WorkNotificationView {
  notificationId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface WorkUiState {
  state: StudioDataState;
  message: string | null;
  /** Raw `details.dependency` for setup states (mapped to a label, never shown). */
  dependency?: string | null;
}

export function workUiState(state: StudioDataState, message: string | null = null, dependency: string | null = null): WorkUiState {
  return dependency === null ? { state, message } : { state, message, dependency };
}
