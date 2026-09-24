/**
 * CHAT_A2_2 — reader-respecting scroll-follow.
 *
 * While the reader sits near the bottom, streamed content may keep the
 * conversation following. Any sign the reader is looking back — scrolling
 * up past the threshold, PageUp/Home/ArrowUp navigation, text selection —
 * suspends follow and surfaces a compact "Jump to latest" control. Follow
 * resumes only via that control or a manual return to the bottom. The reader
 * is never yanked while reading older content.
 */

export const SCROLL_FOLLOW_THRESHOLD_PX = 64;

export type ScrollMetrics = Readonly<{
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}>;

export function distanceFromBottom(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

export function isNearBottom(distancePx: number): boolean {
  return distancePx <= SCROLL_FOLLOW_THRESHOLD_PX;
}

/** Scroll handler decision: follow only while within the threshold. */
export function followOnScroll(metrics: ScrollMetrics): boolean {
  return isNearBottom(distanceFromBottom(metrics));
}

/** Upward keyboard navigation always suspends follow. */
export function suspendsOnKey(key: string): boolean {
  return key === "PageUp" || key === "Home" || key === "ArrowUp";
}

/** Text selection always suspends follow (preserves selection + find). */
export function suspendOnSelect(): false {
  return false;
}

/** "Jump to latest" always resumes follow. */
export function resumeOnJump(): true {
  return true;
}
