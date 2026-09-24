/**
 * STUDIO_18 — review workspace.
 * Request list with live validity, detail with pinned versions,
 * comment/annotation thread, reviewer decisions, and admin public
 * links (minted token shown once, revocation immediate). Stale
 * reviews refuse approval and offer the new-request changes cycle.
 */
"use client";

import { useState } from "react";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { WorkCommentView, WorkLinkView, WorkReviewView, WorkUiState } from "./types";

export function ReviewWorkspace({
  uiState,
  reviews,
  selected,
  comments,
  links,
  busy,
  notice,
  mintToken,
  onRetry,
  onSelect,
  onDecide,
  onCancel,
  onComment,
  onMintLink,
  onRevokeLink,
  onRerequest,
}: {
  uiState: WorkUiState;
  reviews: readonly WorkReviewView[];
  selected: WorkReviewView | null;
  comments: readonly WorkCommentView[];
  links: readonly WorkLinkView[];
  busy: string | null;
  notice: string | null;
  mintToken: { linkId: string; token: string } | null;
  onRetry: () => void;
  onSelect: (reviewId: string) => void;
  onDecide: (review: WorkReviewView, decision: "approved" | "changes_requested" | "denied", feedback: string | null) => void;
  onCancel: (review: WorkReviewView) => void;
  onComment: (body: string) => void;
  onMintLink: (review: WorkReviewView) => void;
  onRevokeLink: (link: WorkLinkView) => void;
  onRerequest: (review: WorkReviewView) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [commentBody, setCommentBody] = useState("");

  return (
    <section aria-label="Reviews" data-testid="work-reviews" className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        Studio work · reviews · pinned approvals
      </p>
      {notice ? (
        <p data-testid="work-review-notice" role="status" className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
          {notice}
        </p>
      ) : null}
      {mintToken ? (
        <p role="alert" className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12.5px] text-[var(--text-primary)]" data-testid="work-link-token">
          Link token (shown once — copy now): <code className="font-mono text-[11.5px]">{mintToken.token}</code>
        </p>
      ) : null}
      {uiState.state === "loading" ? (
        <p role="status" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
          Loading reviews…
        </p>
      ) : null}
      {uiState.state === "empty" ? (
        <StudioEmptyState
          title="No reviews yet"
          description="Select assets in the library and request a review to start the approval cycle."
          actionLabel="Open assets"
          actionHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : undefined}
          testId="work-reviews-empty"
        />
      ) : null}
      {uiState.state === "setup" ? (
        <StudioSetupState
          what="Reviews"
          dependency={uiState.dependency}
          primaryLabel="Go to Assets"
          primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
          testId="work-reviews-setup"
        />
      ) : null}
      {(uiState.state === "error" || uiState.state === "permission") && (
        <StudioErrorState
          title={uiState.state === "permission" ? "Sign in required" : "Reviews unavailable"}
          description={uiState.message ?? "Review listing failed."}
          retryLabel={uiState.state === "error" ? "Retry" : undefined}
          onRetry={uiState.state === "error" ? onRetry : undefined}
          testId="work-reviews-error"
        />
      )}
      {uiState.state === "ready" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <ul className="space-y-2" aria-label="Review requests">
            {reviews.map((review) => (
              <li key={review.reviewId}>
                <button
                  type="button"
                  onClick={() => onSelect(review.reviewId)}
                  aria-current={selected?.reviewId === review.reviewId}
                  className={`block w-full rounded-[12px] px-4 py-3 text-left transition ${STUDIO_FOCUS_RING_CLASS} ${
                    selected?.reviewId === review.reviewId
                      ? "bg-[var(--bg-elevated)] ring-1 ring-[var(--border-default)]"
                      : "bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <span className="block truncate text-[13.5px] text-[var(--text-primary)]">{review.title}</span>
                  <span className="mt-1 block text-[11.5px] text-[var(--text-secondary)]">
                    {review.statusLabel} · {review.pinnedAssets.length} asset{review.pinnedAssets.length === 1 ? "" : "s"}
                    {review.valid ? "" : " · stale"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rounded-[16px] bg-[var(--bg-surface)] px-5 py-4" aria-live="polite">
            {!selected ? (
              <p className="py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                Select a review to read pins, comments, and decisions.
              </p>
            ) : (
              <article data-testid={`review-detail-${selected.reviewId}`}>
                <h3 className="text-[16px] text-[var(--text-primary)]">{selected.title}</h3>
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                  {selected.statusLabel} · requested by {selected.requestedBy || "—"}
                  {selected.decidedBy ? ` · decided by ${selected.decidedBy}` : ""}
                </p>
                {!selected.valid && selected.validityReason ? (
                  <p role="alert" className="mt-2 rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2 text-[12.5px] text-[var(--text-primary)]">
                    {selected.validityReason}
                  </p>
                ) : null}
                {selected.feedback ? (
                  <p className="mt-2 text-[12.5px] text-[var(--text-secondary)]">Feedback: {selected.feedback}</p>
                ) : null}
                <h4 className="mt-4 text-[12px] font-medium text-[var(--text-primary)]">Pinned assets</h4>
                <ul className="mt-1.5 space-y-1.5">
                  {selected.pinnedAssets.map((pin) => (
                    <li key={pin.assetId} className="flex items-baseline justify-between gap-3 rounded-[9px] bg-[var(--bg-inset)] px-3 py-2">
                      <span className="truncate font-mono text-[11px] text-[var(--text-primary)]">{pin.assetId}</span>
                      <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
                        {pin.version === null ? "needs exact version" : `v${pin.version}`}
                      </span>
                    </li>
                  ))}
                </ul>

                {selected.status === "requested" ? (
                  <div className="mt-4 space-y-2">
                    <label className="block">
                      <span className="text-[12px] text-[var(--text-secondary)]">Decision feedback (required to decline)</span>
                      <input
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        placeholder="What should change?"
                        className={`mt-1 min-h-[44px] w-full rounded-[9px] bg-[var(--bg-inset)] px-3 py-2.5 text-[12.5px] text-[var(--text-primary)] outline-none ${STUDIO_FOCUS_RING_CLASS}`}
                      />
                    </label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Decide review">
                      {(["approved", "changes_requested", "denied"] as const).map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          disabled={busy !== null || (decision === "approved" && !selected.valid)}
                          title={decision === "approved" && !selected.valid ? "Stale reviews cannot be approved — request a new review." : undefined}
                          onClick={() => onDecide(selected, decision, feedback.trim() ? feedback.trim() : null)}
                          className={
                            decision === "approved"
                              ? `inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`
                              : `inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`
                          }
                        >
                          {decision === "approved" ? "Approve" : decision === "changes_requested" ? "Request changes" : "Deny"}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => onCancel(selected)}
                        className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3.5 py-2 text-[12.5px] text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => onRerequest(selected)}
                      className={`inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      Request a new review
                    </button>
                  </div>
                )}

                <h4 className="mt-5 text-[12px] font-medium text-[var(--text-primary)]">
                  Comments ({comments.length})
                </h4>
                {comments.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">No comments yet.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {comments.map((comment) => (
                      <li key={comment.commentId} className="rounded-[9px] bg-[var(--bg-inset)] px-3 py-2">
                        <p className="text-[12.5px] text-[var(--text-primary)]">{comment.body}</p>
                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                          {comment.authorId}
                          {comment.annotation ? ` · annotated ${comment.annotation.assetId} (${comment.annotation.x.toFixed(2)}, ${comment.annotation.y.toFixed(2)})` : ""}
                          {comment.resolvedAt ? " · resolved" : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Add a comment…"
                    aria-label="Add a comment"
                    className={`min-h-[44px] min-w-0 flex-1 rounded-[9px] bg-[var(--bg-inset)] px-3 py-2.5 text-[12.5px] text-[var(--text-primary)] outline-none ${STUDIO_FOCUS_RING_CLASS}`}
                  />
                  <button
                    type="button"
                    disabled={!commentBody.trim() || busy !== null}
                    onClick={() => {
                      onComment(commentBody.trim());
                      setCommentBody("");
                    }}
                    className={`shrink-0 rounded-[9px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    Post
                  </button>
                </div>

                <h4 className="mt-5 text-[12px] font-medium text-[var(--text-primary)]">
                  Public links ({links.length})
                </h4>
                {links.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">No public links. Admins can mint one below.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {links.map((link) => (
                      <li key={link.linkId} className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] bg-[var(--bg-inset)] px-3 py-2">
                        <span className="text-[11.5px] text-[var(--text-secondary)]">
                          {link.assetIds.length} asset{link.assetIds.length === 1 ? "" : "s"} · expires {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "—"}
                          {link.revokedAt ? " · revoked" : ""}
                          {link.origin === "legacy-review-link" ? " · legacy" : ""}
                        </span>
                        {!link.revokedAt ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => onRevokeLink(link)}
                            className={`inline-flex min-h-[44px] items-center rounded-[7px] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11.5px] text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => onMintLink(selected)}
                  className={`mt-2 inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--bg-elevated)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  Mint public link (7 days)
                </button>
              </article>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
