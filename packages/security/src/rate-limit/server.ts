import "server-only";

import { NextRequest } from "next/server";
import { jsonError } from "../errors";
import { isProductionRuntime } from "@ethen/config/env-contract";
import { hitRateLimit } from "@ethen/ai/platform/distributed/coordination";

export interface RateLimitPolicy {
  id: string;
  max: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_STORE_KEY = "__ethenRateLimitStore";

function getStore(): Map<string, RateLimitEntry> {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitEntry>;
  };

  if (!globalScope[RATE_LIMIT_STORE_KEY]) {
    globalScope[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>();
  }

  return globalScope[RATE_LIMIT_STORE_KEY]!;
}

function getClientIdentifier(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
  return candidate.slice(0, 128);
}

function localRateLimit(request: NextRequest, policy: RateLimitPolicy) {
  const now = Date.now();
  const store = getStore();
  const key = `${policy.id}:${getClientIdentifier(request)}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + policy.windowMs });
    return null;
  }

  if (current.count >= policy.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return jsonError({
      status: 429,
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
      details: {
        policy: policy.id,
        retryAfterSeconds,
      },
    });
  }

  current.count += 1;
  store.set(key, current);
  return null;
}

export async function enforceRateLimit(request: NextRequest, policy: RateLimitPolicy) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return localRateLimit(request, policy);
  }

  const identity = getClientIdentifier(request);
  const distributed = await hitRateLimit({
    key: `http:${policy.id}:${identity}`,
    max: policy.max,
    windowMs: policy.windowMs,
  });

  if (distributed.unavailable) {
    if (isProductionRuntime()) {
      return jsonError({
        status: 503,
        code: "RATE_LIMIT_UNAVAILABLE",
        error: "Distributed rate limiting is unavailable.",
        details: { policy: policy.id },
      });
    }
    return localRateLimit(request, policy);
  }

  if (!distributed.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((distributed.resetAt - Date.now()) / 1000),
    );
    return jsonError({
      status: 429,
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
      details: {
        policy: policy.id,
        retryAfterSeconds,
      },
    });
  }

  return null;
}

export const RATE_LIMIT_POLICIES = {
  chat: { id: "chat", max: 20, windowMs: 60_000 },
  writing: { id: "writing", max: 20, windowMs: 60_000 },
  research: { id: "research", max: 12, windowMs: 60_000 },
  finance: { id: "finance", max: 30, windowMs: 60_000 },
  jobSearch: { id: "job-search", max: 30, windowMs: 60_000 },
  travel: { id: "travel", max: 30, windowMs: 60_000 },
  realEstate: { id: "real-estate", max: 30, windowMs: 60_000 },
  localRepo: { id: "local-repo", max: 30, windowMs: 60_000 },
  productScraper: { id: "product-scraper", max: 20, windowMs: 60_000 },
  shipping: { id: "shipping", max: 30, windowMs: 60_000 },
  googleDrive: { id: "google-drive", max: 20, windowMs: 60_000 },
  gmail: { id: "gmail", max: 20, windowMs: 60_000 },
  googleCalendar: { id: "google-calendar", max: 20, windowMs: 60_000 },
  googleDocs: { id: "google-docs", max: 20, windowMs: 60_000 },
  googleSheets: { id: "google-sheets", max: 20, windowMs: 60_000 },
  microsoft365: { id: "microsoft365", max: 30, windowMs: 60_000 },
  founderProvision: { id: "founder-provision", max: 10, windowMs: 60_000 },
  voiceTranscribe: { id: "voice-transcribe", max: 20, windowMs: 60_000 },
  voiceSpeech: { id: "voice-speech", max: 30, windowMs: 60_000 },
  voiceRealtime: { id: "voice-realtime", max: 10, windowMs: 60_000 },
  mediaFal: { id: "media-fal", max: 10, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;
