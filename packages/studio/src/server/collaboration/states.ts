/** Studio V5 collaboration — explicit typed states for UI consumers (STUDIO_18). */
import "server-only";
import { errorState, loadingState, readyState, type LoadState } from "../../contracts/states";
import { studioError } from "../../contracts/errors";
import { reviewStatusLabel } from "./reviews";
import type { JobTruthView, ReviewComment, ReviewRequest, StudioNotification } from "./types";

export interface ReviewDetail {
  review: ReviewRequest;
  validity: { valid: boolean; reason: string | null };
  comments: readonly ReviewComment[];
}

export function reviewLoadingState(): LoadState<ReviewDetail> {
  return loadingState<ReviewDetail>();
}

export function reviewReadyState(detail: ReviewDetail): LoadState<ReviewDetail> {
  return readyState(detail);
}

/** Stale-review state: complete facts (status + reason), never silent. */
export function reviewStaleState(detail: ReviewDetail, reason: string): LoadState<ReviewDetail> {
  return {
    kind: "ready",
    data: detail,
    error: studioError("CONFLICT", reason, detail.review.reviewId, false, {
      status: reviewStatusLabel(detail.review.status),
    }),
    actionLabel: "Request a new review",
  };
}

export function reviewSetupState(message: string): LoadState<ReviewDetail> {
  return {
    kind: "setup_required",
    data: null,
    error: studioError("FORBIDDEN", message, "review-setup", false, {}),
    actionLabel: "Select a project",
  };
}

export function reviewErrorState(requestId: string, message: string): LoadState<ReviewDetail> {
  return errorState<ReviewDetail>(studioError("INTERNAL", message, requestId, true, {}));
}

export interface JobsTruthList {
  jobs: readonly JobTruthView[];
}

export function jobsLoadingState(): LoadState<JobsTruthList> {
  return loadingState<JobsTruthList>();
}

export function jobsReadyState(list: JobsTruthList): LoadState<JobsTruthList> {
  return readyState(list);
}

export interface NotificationCenter {
  notifications: readonly StudioNotification[];
  unread: number;
}

export function notificationsReadyState(center: NotificationCenter): LoadState<NotificationCenter> {
  return readyState(center);
}
