import "server-only";

import { join } from "node:path";

/**
 * M0-J06 / M0-J07 — evidence handling for the live hosted-browser canary.
 *
 * Two problems this module exists to solve, both found by the Opus 5 audit:
 *
 * F-20: the CU-P0-09 suite used to self-enable on credential presence alone, so
 *   any full `pnpm test:behavioral` run on a machine holding Cloudflare
 *   credentials silently billed the account AND wrote new files into a tracked
 *   evidence directory, dirtying the worktree. Enablement now requires an
 *   explicit opt-in flag in addition to credentials.
 *
 * F-15: receipts embedded the Cloudflare account identifier inside the DevTools
 *   endpoint URL and committed it. The identifier is not a credential, but it is
 *   avoidable infrastructure detail; it is redacted before persistence while the
 *   receipt keeps its shape (still an absolute wss:// URL on the provider host).
 */

/** Explicit opt-in required before any billable live browser session is created. */
export const LIVE_BROWSER_CANARY_FLAG = "ETHEN_LIVE_BROWSER_CANARY";

/**
 * Credentials alone must never be sufficient. The operator has to say so.
 */
export function isLiveBrowserCanaryOptedIn(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[LIVE_BROWSER_CANARY_FLAG] === "true";
}

/**
 * Where canary receipts and screenshots are written.
 *
 * Defaults to an untracked scratch location so a canary run never dirties the
 * worktree or appends to committed certification evidence. `.local/` is already
 * gitignored. An operator archiving a certification run can point
 * ETHEN_BROWSER_CANARY_EVIDENCE_DIR somewhere deliberate.
 */
export function hostedCanaryEvidenceDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd: string = process.cwd(),
): string {
  const override = env.ETHEN_BROWSER_CANARY_EVIDENCE_DIR?.trim();
  if (override) return override;
  return join(cwd, ".local", "canary", "computer-use");
}

const ACCOUNT_SEGMENT = /\/accounts\/[0-9a-zA-Z_-]+\//;

/**
 * Replace the account-id path segment of a provider endpoint URL. The host, the
 * scheme, and the session id are preserved, so assertions about the provider
 * host and session identity still hold.
 */
export function redactProviderEndpoint(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  return url.replace(ACCOUNT_SEGMENT, "/accounts/[redacted]/");
}

type RedactableAttestation = Record<string, unknown> & {
  endpoint?: unknown;
  webSocketDebuggerUrl?: unknown;
};

/**
 * Redact every endpoint-shaped field on a receipt before it is written to disk.
 * The in-memory receipt is left untouched — callers that need to reconnect still
 * hold the real endpoint.
 */
export function redactReceiptForPersistence<T extends Record<string, unknown>>(receipt: T): T {
  const next: Record<string, unknown> = { ...receipt };
  if (typeof next.endpoint === "string") {
    next.endpoint = redactProviderEndpoint(next.endpoint);
  }
  const attestation = next.attestation as RedactableAttestation | null | undefined;
  if (attestation && typeof attestation === "object") {
    const nextAttestation: RedactableAttestation = { ...attestation };
    if (typeof nextAttestation.endpoint === "string") {
      nextAttestation.endpoint = redactProviderEndpoint(nextAttestation.endpoint);
    }
    if (typeof nextAttestation.webSocketDebuggerUrl === "string") {
      nextAttestation.webSocketDebuggerUrl = redactProviderEndpoint(
        nextAttestation.webSocketDebuggerUrl,
      );
    }
    next.attestation = nextAttestation;
  }
  return next as T;
}
