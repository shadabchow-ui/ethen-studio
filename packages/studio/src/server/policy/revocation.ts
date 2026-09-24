/**
 * Studio V5 policy — immediate revocation events + runtime ports (STUDIO_03).
 *
 * Revocation blocks new admission immediately, requests cancellation of
 * active work, and quarantines uncancellable late outputs. The runtime
 * (STUDIO_05) binds real cancel/quarantine implementations; this module
 * defines the ports plus in-memory fakes for tests and local use.
 */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import type { ConsentRevocation } from "./types";

export interface RevocationEvent {
  type: "consent.revoked";
  grantId: string;
  scope: ProjectScope;
  identityId: string;
  revokedAt: string;
  reason: string;
  revocationId: string;
}

export function toRevocationEvent(revocation: ConsentRevocation): RevocationEvent {
  return {
    type: "consent.revoked",
    grantId: revocation.grantId,
    scope: revocation.scope,
    identityId: revocation.identityId,
    revokedAt: revocation.revokedAt,
    reason: revocation.reason,
    revocationId: revocation.revocationId,
  };
}

export interface CancelReceipt {
  jobId: string;
  cancelled: boolean;
  detail: string;
}

/** Runtime port: cooperatively cancel active jobs (bound by STUDIO_05). */
export interface CancelPort {
  requestCancel(scope: ProjectScope, jobIds: readonly string[], reason: string): Promise<readonly CancelReceipt[]>;
}

export interface QuarantineRef {
  assetId: string;
  assetVersion: number;
  jobId: string;
}

/** Runtime port: quarantine outputs that must never deliver (bound by STUDIO_05). */
export interface QuarantinePort {
  quarantine(scope: ProjectScope, refs: readonly QuarantineRef[], reason: string): Promise<void>;
}

export interface RevocationDispatchDeps {
  cancel: CancelPort;
  quarantine: QuarantinePort;
  /** Active job ids using the revoked grant (runtime query). */
  listActiveJobsForGrant: (scope: ProjectScope, grantId: string) => Promise<readonly string[]>;
  /** Unsettled outputs bound to the revoked grant (runtime query). */
  listUnsettledOutputsForGrant: (scope: ProjectScope, grantId: string) => Promise<readonly QuarantineRef[]>;
}

export interface RevocationDispatchReport {
  event: RevocationEvent;
  cancelled: readonly CancelReceipt[];
  quarantined: readonly QuarantineRef[];
}

/** Dispatch a revocation: cancel active work, quarantine unsettled outputs. */
export async function dispatchRevocation(
  event: RevocationEvent,
  deps: RevocationDispatchDeps,
): Promise<RevocationDispatchReport> {
  const jobIds = await deps.listActiveJobsForGrant(event.scope, event.grantId);
  const cancelled = jobIds.length > 0
    ? await deps.cancel.requestCancel(event.scope, jobIds, `Consent revoked: ${event.reason}`)
    : [];
  const outputs = await deps.listUnsettledOutputsForGrant(event.scope, event.grantId);
  if (outputs.length > 0) {
    await deps.quarantine.quarantine(
      event.scope,
      outputs,
      `Consent revoked for ${event.identityId}; outputs cannot deliver.`,
    );
  }
  return { event, cancelled, quarantined: outputs };
}

/** In-memory cancel port for tests/local use. */
export class MemoryCancelPort implements CancelPort {
  readonly requests: Array<{ scope: ProjectScope; jobIds: readonly string[]; reason: string }> = [];

  async requestCancel(
    scope: ProjectScope,
    jobIds: readonly string[],
    reason: string,
  ): Promise<readonly CancelReceipt[]> {
    this.requests.push({ scope, jobIds, reason });
    return jobIds.map((jobId) => ({ jobId, cancelled: true, detail: "cancel requested" }));
  }
}

/** In-memory quarantine port for tests/local use. */
export class MemoryQuarantinePort implements QuarantinePort {
  readonly quarantined: Array<{ scope: ProjectScope; refs: readonly QuarantineRef[]; reason: string }> = [];

  async quarantine(scope: ProjectScope, refs: readonly QuarantineRef[], reason: string): Promise<void> {
    this.quarantined.push({ scope, refs, reason });
  }
}
