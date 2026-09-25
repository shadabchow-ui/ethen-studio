import "server-only";

/**
 * P03 — typed Studio setup failures (RC-6).
 *
 * A missing data-service client is an environment setup condition, never
 * an internal error. `requireServiceClient()` throws `StudioSetupError`
 * (dependency "supabase"); every V1 family's error mapper converts it to
 * HTTP 503 `SETUP_REQUIRED` with `details: { dependency }` via
 * `setupRequiredResponse`. Response messages stay human-readable and
 * never name env vars or carry secret values — the UI maps
 * `details.dependency` to its own label and never shows raw text.
 */
import { studioError } from "./api-v1";

export type StudioSetupDependency = "supabase" | "object-storage" | "temporal" | "worker" | "provider";

export class StudioSetupError extends Error {
  readonly dependency: StudioSetupDependency;

  constructor(dependency: StudioSetupDependency = "supabase", message?: string) {
    super(message ?? "The Studio data service is not configured here.");
    this.name = "StudioSetupError";
    this.dependency = dependency;
  }
}

export function isStudioSetupError(error: unknown): error is StudioSetupError {
  return error instanceof StudioSetupError;
}

/**
 * Map a setup failure onto the shared 503 envelope, or null when the
 * error is not a setup failure. Call this FIRST in every V1 catch or
 * family failure mapper so typed setup errors pass through before any
 * `INTERNAL_ERROR` fallback.
 */
export function setupRequiredResponse(error: unknown, message: string): Response | null {
  if (!isStudioSetupError(error)) return null;
  return studioError("SETUP_REQUIRED", message, undefined, { dependency: error.dependency });
}

/**
 * S4C — Supabase credential faults (rotated/mismatched keys) are a setup
 * condition, not a code crash: callers map these to StudioSetupError so
 * the API answers 503 SETUP_REQUIRED with the supabase dependency instead
 * of a misleading 500.
 */
export function isSupabaseCredentialFault(message: string | null | undefined): boolean {
  if (!message) return false;
  return /invalid api key/i.test(message);
}
