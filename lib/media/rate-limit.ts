// ── Beta Rate-Limit Foundation ────────────────────────────────────────────────
// Simple per-session rate limit utility. Uses in-memory tracking with a
// local/client fallback. Does not use Redis or external rate-limit services.
// Not suitable for production without a distributed store.
//
// Labels are honest: beta, not full abuse prevention, manual_review when needed.

export interface RateLimitConfig {
  key: string;
  maxRequests: number;
  windowMs: number;
  label?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
  limit: number;
  message: string;
  blocked: boolean;
}

export interface RateLimitTracker {
  config: RateLimitConfig;
  count: number;
  windowStart: number;
  lastRequestAt: number;
}

const DEFAULT_IMAGE_PER_MINUTE: RateLimitConfig = {
  key: "image-per-minute",
  maxRequests: 10,
  windowMs: 60_000,
  label: "Image generations per minute (beta limit)",
};

const DEFAULT_VIDEO_PER_HOUR: RateLimitConfig = {
  key: "video-per-hour",
  maxRequests: 5,
  windowMs: 3_600_000,
  label: "Video generations per hour (beta limit)",
};

const DEFAULT_CONCURRENT_VIDEO: RateLimitConfig = {
  key: "concurrent-video",
  maxRequests: 2,
  windowMs: 0, // Always active — counts active jobs
  label: "Concurrent video jobs (beta limit)",
};

let trackers: RateLimitTracker[] = [];
const activeVideoJobs: Set<string> = new Set();

function now(): number {
  return Date.now();
}

function getOrCreateTracker(config: RateLimitConfig): RateLimitTracker {
  let tracker = trackers.find((t) => t.config.key === config.key);
  if (!tracker) {
    tracker = {
      config,
      count: 0,
      windowStart: now(),
      lastRequestAt: 0,
    };
    trackers.push(tracker);
  }
  return tracker;
}

function isWindowExpired(tracker: RateLimitTracker): boolean {
  if (tracker.config.windowMs === 0) return false;
  return now() - tracker.windowStart >= tracker.config.windowMs;
}

export function checkRateLimit(
  key: string,
  config?: Partial<RateLimitConfig>,
): RateLimitResult {
  const resolved: RateLimitConfig = {
    key,
    maxRequests: config?.maxRequests ?? 10,
    windowMs: config?.windowMs ?? 60_000,
    label: config?.label,
  };

  const tracker = getOrCreateTracker(resolved);

  if (isWindowExpired(tracker)) {
    tracker.count = 0;
    tracker.windowStart = now();
  }

  tracker.count++;
  tracker.lastRequestAt = now();

  const allowed = tracker.count <= resolved.maxRequests;
  const remaining = Math.max(0, resolved.maxRequests - tracker.count);
  const resetAt = tracker.windowStart + resolved.windowMs;

  return {
    allowed,
    remaining,
    resetAt,
    retryAfterMs: allowed ? 0 : Math.max(0, resetAt - now()),
    limit: resolved.maxRequests,
    message: allowed
      ? "Within rate limit (beta)."
      : `Rate limit reached: ${resolved.label ?? key}. Wait ${Math.ceil((resetAt - now()) / 1000)}s before retrying (beta).`,
    blocked: !allowed,
  };
}

export function checkImageRateLimit(): RateLimitResult {
  return checkRateLimit("image-per-minute", DEFAULT_IMAGE_PER_MINUTE);
}

export function checkVideoRateLimit(): RateLimitResult {
  return checkRateLimit("video-per-hour", DEFAULT_VIDEO_PER_HOUR);
}

export function checkConcurrentVideoLimit(): RateLimitResult {
  const limit = DEFAULT_CONCURRENT_VIDEO.maxRequests;
  const remaining = Math.max(0, limit - activeVideoJobs.size);
  return {
    allowed: activeVideoJobs.size < limit,
    remaining,
    resetAt: 0,
    retryAfterMs: activeVideoJobs.size >= limit ? 30_000 : 0,
    limit,
    message: activeVideoJobs.size < limit
      ? "Within concurrent video job limit (beta)."
      : `Concurrent video jobs at limit (${limit}). Wait for an active job to complete (beta).`,
    blocked: activeVideoJobs.size >= limit,
  };
}

export function trackActiveVideoJob(jobId: string): void {
  activeVideoJobs.add(jobId);
}

export function releaseVideoJob(jobId: string): void {
  activeVideoJobs.delete(jobId);
}

export function getActiveVideoJobsCount(): number {
  return activeVideoJobs.size;
}

export function resetRateLimits(): void {
  trackers = [];
  activeVideoJobs.clear();
}

export function getRateLimitStatus(): {
  imageRemaining: number;
  videoRemaining: number;
  concurrentVideoRemaining: number;
  activeVideoJobs: number;
} {
  return {
    imageRemaining: checkRateLimit("image-per-minute", DEFAULT_IMAGE_PER_MINUTE).remaining,
    videoRemaining: checkRateLimit("video-per-hour", DEFAULT_VIDEO_PER_HOUR).remaining,
    concurrentVideoRemaining: checkConcurrentVideoLimit().remaining,
    activeVideoJobs: activeVideoJobs.size,
  };
}
