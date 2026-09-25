/**
 * S4C — Studio auth-on-action core (framework-free).
 *
 * Pure/browser-safe contracts shared by API clients, gates, and tests:
 * no React, no Clerk, no Next imports. The React shell
 * (`studio-auth-action.tsx`) adds the provider + hooks on top.
 */

export const STUDIO_REQUIRE_AUTH_EVENT = "ethen:studio:require-auth";

export interface StudioRequireAuthDetail {
  /** Stable action label for telemetry/debugging (never user data). */
  action?: string;
}

/** Dispatch a modal sign-in request (browser only; no-op on server). */
export function requestStudioSignIn(detail: StudioRequireAuthDetail = {}): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent<StudioRequireAuthDetail>(STUDIO_REQUIRE_AUTH_EVENT, { detail }));
}

/** True for the API shapes Studio uses to deny unauthenticated callers. */
export function isStudioAuthFailure(status: number | null, code: string | null | undefined): boolean {
  if (status === 401) return true;
  if (!code) return false;
  return (
    code === "AUTHENTICATION_REQUIRED" ||
    code === "unauthenticated" ||
    code === "UNAUTHORIZED" ||
    code === "signed_out"
  );
}

export class StudioAuthRequiredError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  constructor(message = "Sign in to continue.", status: number | null = 401, code: string | null = "AUTHENTICATION_REQUIRED") {
    super(message);
    this.name = "StudioAuthRequiredError";
    this.status = status;
    this.code = code;
  }
}

export function isStudioAuthRequiredError(error: unknown): error is StudioAuthRequiredError {
  return error instanceof StudioAuthRequiredError;
}

/**
 * Translate an unauthenticated API response into the modal flow. Call from
 * API clients right where they parse failures; returns true when the
 * failure was auth-shaped (caller should throw StudioAuthRequiredError).
 */
export function translateStudioAuthFailure(status: number, code: string | null | undefined, action?: string): boolean {
  if (!isStudioAuthFailure(status, code)) return false;
  requestStudioSignIn(action ? { action } : {});
  return true;
}
