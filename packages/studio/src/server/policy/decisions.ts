/**
 * Studio V5 policy — common policy decisions (STUDIO_03, server-only).
 *
 * Merges append-only consent/revocation, rights assertions, publish
 * authorities, review-link capabilities, content review, and spend approval
 * into one reproducible decision. Every check binds actor + scope +
 * identity/version + task + destination. Unknown legacy permission blocks.
 * Content review, rights, and spend are independent axes: satisfying one
 * never satisfies another.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { isTaskName, type TaskName } from "../../contracts/tasks";
import type { PolicyAction, PolicyDecision } from "../../contracts/policy";
import type { ProjectScope } from "../../contracts/scope";
import { effectiveConsentStatus, type ConsentRepository } from "./consent";
import { selectRightsAssertion, type RightsRepository } from "./rights";
import type { AuthorityRepository } from "./authority";
import {
  authorizeReviewLinkPresentation,
  type MemoryReviewLinkStore,
} from "./review-links";
import type { QuarantinePort } from "./revocation";
import { STUDIO_POLICY_VERSION, reasonDetail, type PolicyReasonCode } from "./reason-codes";
import type { PolicyRequest, PublishAuthority } from "./types";

export interface PolicyStores {
  consents: ConsentRepository;
  rights: RightsRepository;
  authorities: AuthorityRepository;
  reviewLinks: MemoryReviewLinkStore;
}

export interface PolicyAxisResult {
  required: boolean;
  satisfied: boolean;
  reasonCode: PolicyReasonCode;
  evidenceIds: readonly string[];
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  reasonCode: PolicyReasonCode;
  consent: PolicyAxisResult;
  rights: PolicyAxisResult;
  publishAuthority: PolicyAxisResult;
  contentReview: PolicyAxisResult;
  spend: PolicyAxisResult;
}

const KNOWN_ACTIONS: readonly PolicyAction[] = [
  "generate",
  "export",
  "download",
  "share",
  "publish",
  "protected_serve",
];

function satisfiedAxis(evidenceIds: readonly string[] = []): PolicyAxisResult {
  return { required: true, satisfied: true, reasonCode: "ALLOWED", evidenceIds };
}

function notRequiredAxis(): PolicyAxisResult {
  return { required: false, satisfied: true, reasonCode: "ALLOWED", evidenceIds: [] };
}

function failedAxis(reasonCode: PolicyReasonCode, evidenceIds: readonly string[] = []): PolicyAxisResult {
  return { required: true, satisfied: false, reasonCode, evidenceIds };
}

function roleAllows(request: PolicyRequest): boolean {
  const roles = new Set(request.actor.roles);
  if (roles.size === 0) return false;
  switch (request.action) {
    case "generate":
      return roles.has("creator") || roles.has("admin");
    case "export":
    case "download":
    case "protected_serve":
      return roles.has("viewer") || roles.has("creator") || roles.has("reviewer") || roles.has("admin");
    case "share":
      return roles.has("creator") || roles.has("reviewer") || roles.has("admin");
    case "publish":
      return roles.has("creator") || roles.has("admin");
    default:
      return false;
  }
}

function operationCovered(operations: readonly string[], task: TaskName, action: PolicyAction): boolean {
  return operations.includes(action) || operations.includes(task);
}

function channelCovered(channels: readonly string[], destinationChannel: string | null): boolean {
  if (channels.length === 0) return true;
  if (!destinationChannel) return true;
  return channels.includes(destinationChannel);
}

async function evaluateConsentAxis(
  stores: PolicyStores,
  request: PolicyRequest,
  atMs: number,
): Promise<PolicyAxisResult> {
  if (!request.identityId) return notRequiredAxis();
  const grants = await stores.consents.listGrantsForIdentity(request.scope, request.identityId);
  const isAdmin = request.actor.roles.includes("admin");
  if (grants.length === 0) {
    // Admins manage settings but cannot invent consent.
    return failedAxis(isAdmin ? "IDENTITY_RIGHTS_MISSING" : "CONSENT_MISSING");
  }
  const destinationChannel = request.destination?.channel ?? null;
  let sawUnknown = false;
  let sawMismatch = false;
  const mismatchEvidence: string[] = [];
  for (const grant of grants) {
    const revocations = await stores.consents.listRevocations(request.scope, grant.grantId);
    const status = effectiveConsentStatus(grant, revocations, atMs);
    if (status === "revoked") {
      return failedAxis("CONSENT_REVOKED", [grant.grantId, ...revocations.map((r) => r.revocationId)]);
    }
    if (status === "expired") continue;
    if (status === "needs_review") {
      return failedAxis("CONSENT_NEEDS_REVIEW", [grant.grantId]);
    }
    if (status === "unknown" || grant.verificationState === "unknown") {
      sawUnknown = true;
      continue;
    }
    if (!operationCovered(grant.operations, request.task, request.action)) {
      sawMismatch = true;
      mismatchEvidence.push(grant.grantId);
      continue;
    }
    if (!channelCovered(grant.channels, destinationChannel)) {
      sawMismatch = true;
      mismatchEvidence.push(grant.grantId);
      continue;
    }
    if (
      grant.identityVersion !== null &&
      request.identityVersion !== null &&
      grant.identityVersion !== request.identityVersion
    ) {
      sawMismatch = true;
      mismatchEvidence.push(grant.grantId);
      continue;
    }
    if (grant.allowedProviders.length > 0) {
      // Provider binding is checked by routing (STUDIO_06); the grant is
      // recorded as evidence either way.
    }
    return satisfiedAxis([grant.grantId]);
  }
  // Check expired-only case for a precise code.
  const anyExpired = grants.some((g) => {
    if (g.status === "expired") return true;
    return g.expiresAt !== null && Date.parse(g.expiresAt) <= atMs && g.status === "active";
  });
  if (anyExpired && !sawUnknown && !sawMismatch) return failedAxis("CONSENT_EXPIRED");
  if (sawMismatch) return failedAxis("CONSENT_SCOPE_MISMATCH", mismatchEvidence);
  if (sawUnknown) {
    const unknownIds = grants.filter((g) => g.status === "unknown").map((g) => g.grantId);
    return failedAxis("CONSENT_UNKNOWN_LEGACY", unknownIds);
  }
  if (anyExpired) return failedAxis("CONSENT_EXPIRED");
  return failedAxis(isAdmin ? "IDENTITY_RIGHTS_MISSING" : "CONSENT_MISSING");
}

async function evaluateRightsAxis(
  stores: PolicyStores,
  request: PolicyRequest,
  atMs: number,
): Promise<PolicyAxisResult> {
  if (!request.assetId) return notRequiredAxis();
  const rows = await stores.rights.listAssertionsForAsset(request.scope, request.assetId);
  const assertion = selectRightsAssertion(rows, request.assetVersion);
  if (!assertion) return failedAxis("RIGHTS_UNKNOWN");
  const evidence = [assertion.assertionId];
  if (assertion.expiresAt !== null && Date.parse(assertion.expiresAt) <= atMs) {
    return failedAxis("RIGHTS_EXPIRED", evidence);
  }
  if (assertion.status === "blocked") return failedAxis("RIGHTS_BLOCKED", evidence);
  if (assertion.status === "unknown") return failedAxis("RIGHTS_UNKNOWN", evidence);
  const destinationChannel = request.destination?.channel ?? null;
  if (
    assertion.channels.length > 0 &&
    destinationChannel &&
    !assertion.channels.includes(destinationChannel)
  ) {
    return failedAxis("RIGHTS_CHANNEL_MISMATCH", evidence);
  }
  const delivery = request.action === "export" || request.action === "download"
    || request.action === "share" || request.action === "publish";
  if (assertion.status === "preview_only") {
    // Private preview only; delivery is closed.
    if (delivery) return failedAxis("RIGHTS_COMMERCIAL_UNESTABLISHED", evidence);
    return satisfiedAxis(evidence);
  }
  // Cleared: music additionally requires established commercial/export rights.
  if (delivery && (request.assetClass === "music" || assertion.assetClass === "music")) {
    if (assertion.commercialUse !== true || assertion.exportAllowed !== true) {
      return failedAxis("RIGHTS_COMMERCIAL_UNESTABLISHED", evidence);
    }
  }
  if (delivery && (assertion.commercialUse === false || assertion.exportAllowed === false)) {
    return failedAxis("RIGHTS_BLOCKED", evidence);
  }
  return satisfiedAxis(evidence);
}

function authorityMatches(authority: PublishAuthority, request: PolicyRequest): PolicyReasonCode | null {
  if (authority.grantedTo !== request.actor.actorId) return "AUTHORITY_MISSING";
  const channel = request.destination?.channel ?? null;
  if (channel && authority.channel !== channel) return "AUTHORITY_CHANNEL_MISMATCH";
  if (request.assetClass && authority.assetClass !== "*" && authority.assetClass !== request.assetClass) {
    return "AUTHORITY_CLASS_MISMATCH";
  }
  return null;
}

async function evaluateAuthorityAxis(
  stores: PolicyStores,
  request: PolicyRequest,
  atMs: number,
): Promise<PolicyAxisResult> {
  if (request.action !== "publish") return notRequiredAxis();
  const rows = await stores.authorities.listAuthoritiesForActor(request.scope, request.actor.actorId);
  if (rows.length === 0) return failedAxis("AUTHORITY_MISSING");
  let mismatch: PolicyReasonCode = "AUTHORITY_MISSING";
  for (const authority of rows) {
    const mismatchCode = authorityMatches(authority, request);
    if (mismatchCode) {
      if (mismatch === "AUTHORITY_MISSING") mismatch = mismatchCode;
      continue;
    }
    if (authority.revokedAt) return failedAxis("AUTHORITY_REVOKED", [authority.authorityId]);
    if (Date.parse(authority.expiresAt) <= atMs) {
      mismatch = "AUTHORITY_EXPIRED";
      continue;
    }
    if (authority.maxUses !== null && authority.usedCount >= authority.maxUses) {
      mismatch = "AUTHORITY_LIMIT_EXCEEDED";
      continue;
    }
    return satisfiedAxis([authority.authorityId]);
  }
  return failedAxis(mismatch);
}

function evaluateReviewLinkAxis(
  stores: PolicyStores,
  request: PolicyRequest,
  atMs: number,
): PolicyAxisResult {
  const tokenHash = request.destination?.reviewTokenHash ?? null;
  if (request.action !== "share" || !tokenHash) return notRequiredAxis();
  const presentation = authorizeReviewLinkPresentation(
    stores.reviewLinks.list(),
    tokenHash,
    request.scope,
    atMs,
  );
  if (!presentation.ok) return failedAxis(presentation.reasonCode);
  return satisfiedAxis(presentation.linkId ? [presentation.linkId] : []);
}

function evaluateContentReviewAxis(request: PolicyRequest): PolicyAxisResult {
  // Publishing requires an approval pinned to the delivered version.
  // Sharing initiates review, so it intentionally requires no approval.
  if (request.action !== "publish") return notRequiredAxis();
  const review = request.contentReview;
  if (!review || review.state !== "approved") return failedAxis("CONTENT_REVIEW_REQUIRED");
  if (review.pinnedVersion === null || review.pinnedVersion !== review.currentVersion) {
    return failedAxis("CONTENT_REVIEW_REQUIRED");
  }
  return satisfiedAxis();
}

function evaluateSpendAxis(request: PolicyRequest): PolicyAxisResult {
  // Billable admission needs spend approval; rights clearance never implies it.
  if (request.action !== "generate") return notRequiredAxis();
  const spend = request.spendApproval;
  if (!spend || !spend.approved) return failedAxis("SPEND_APPROVAL_REQUIRED");
  return satisfiedAxis(spend.approvalId ? [spend.approvalId] : []);
}

/**
 * Evaluate a policy request across all axes. All axes are always computed
 * (so callers can see each independent condition); the decision denies on
 * the first failing required axis in evaluation order.
 */
export async function evaluatePolicy(
  stores: PolicyStores,
  request: PolicyRequest,
): Promise<PolicyEvaluation> {
  const atMs = request.now ? Date.parse(request.now) : Date.now();
  const decidedAt = new Date(atMs).toISOString();

  const deny = (reasonCode: PolicyReasonCode, axes: Omit<PolicyEvaluation, "decision" | "reasonCode">): PolicyEvaluation => {
    const detail = reasonDetail(reasonCode);
    const evidenceIds = [
      ...axes.consent.evidenceIds,
      ...axes.rights.evidenceIds,
      ...axes.publishAuthority.evidenceIds,
      ...axes.contentReview.evidenceIds,
      ...axes.spend.evidenceIds,
    ];
    return {
      ...axes,
      reasonCode,
      decision: {
        decisionId: randomUUID(),
        scope: request.scope,
        task: request.task,
        action: request.action,
        allowed: false,
        reasonCode,
        remediation: detail.remediation,
        evidenceIds,
        policyVersion: STUDIO_POLICY_VERSION,
        decidedAt,
      },
    };
  };

  if (!isTaskName(request.task as string) || !KNOWN_ACTIONS.includes(request.action)) {
    const axes = {
      consent: notRequiredAxis(),
      rights: notRequiredAxis(),
      publishAuthority: notRequiredAxis(),
      contentReview: notRequiredAxis(),
      spend: notRequiredAxis(),
    };
    return deny("UNKNOWN_ACTION", axes);
  }
  if (!roleAllows(request)) {
    const axes = {
      consent: notRequiredAxis(),
      rights: notRequiredAxis(),
      publishAuthority: notRequiredAxis(),
      contentReview: notRequiredAxis(),
      spend: notRequiredAxis(),
    };
    return deny("FORBIDDEN_ROLE", axes);
  }

  const consent = await evaluateConsentAxis(stores, request, atMs);
  const rights = await evaluateRightsAxis(stores, request, atMs);
  const publishAuthority = await evaluateAuthorityAxis(stores, request, atMs);
  const reviewLink = evaluateReviewLinkAxis(stores, request, atMs);
  const contentReview = evaluateContentReviewAxis(request);
  const spend = evaluateSpendAxis(request);

  const axes = { consent, rights, publishAuthority, contentReview, spend };
  const ordered: PolicyAxisResult[] = [consent, rights, publishAuthority, reviewLink, contentReview, spend];
  const failure = ordered.find((axis) => axis.required && !axis.satisfied);
  if (failure) {
    const detail = reasonDetail(failure.reasonCode);
    const evidenceIds = [
      ...consent.evidenceIds,
      ...rights.evidenceIds,
      ...publishAuthority.evidenceIds,
      ...reviewLink.evidenceIds,
      ...contentReview.evidenceIds,
      ...spend.evidenceIds,
    ];
    return {
      ...axes,
      reasonCode: failure.reasonCode,
      decision: {
        decisionId: randomUUID(),
        scope: request.scope,
        task: request.task,
        action: request.action,
        allowed: false,
        reasonCode: failure.reasonCode,
        remediation: detail.remediation,
        evidenceIds,
        policyVersion: STUDIO_POLICY_VERSION,
        decidedAt,
      },
    };
  }
  return {
    ...axes,
    reasonCode: "ALLOWED",
    decision: {
      decisionId: randomUUID(),
      scope: request.scope,
      task: request.task,
      action: request.action,
      allowed: true,
      reasonCode: "ALLOWED",
      remediation: null,
      evidenceIds: [
        ...consent.evidenceIds,
        ...rights.evidenceIds,
        ...publishAuthority.evidenceIds,
        ...reviewLink.evidenceIds,
        ...contentReview.evidenceIds,
        ...spend.evidenceIds,
      ],
      policyVersion: STUDIO_POLICY_VERSION,
      decidedAt,
    },
  };
}

/**
 * Authorize a late output (produced before dispatch completed) for delivery.
 * Outputs produced after a revocation are quarantined, never delivered;
 * outputs produced before revocation still need a fresh delivery decision.
 */
export async function authorizeLateOutput(
  stores: PolicyStores,
  quarantine: QuarantinePort,
  input: {
    scope: ProjectScope;
    identityId: string;
    assetId: string;
    assetVersion: number;
    outputProducedAt: string;
    jobId: string;
    now?: string;
  },
): Promise<{ quarantined: boolean; reasonCode: PolicyReasonCode; revocationIds: readonly string[] }> {
  const producedMs = Date.parse(input.outputProducedAt);
  const grants = await stores.consents.listGrantsForIdentity(input.scope, input.identityId);
  const revocationIds: string[] = [];
  let earliestRevocationMs: number | null = null;
  for (const grant of grants) {
    const revocations = await stores.consents.listRevocations(input.scope, grant.grantId);
    for (const revocation of revocations) {
      revocationIds.push(revocation.revocationId);
      const at = Date.parse(revocation.revokedAt);
      if (earliestRevocationMs === null || at < earliestRevocationMs) earliestRevocationMs = at;
    }
  }
  if (earliestRevocationMs !== null && producedMs > earliestRevocationMs) {
    await quarantine.quarantine(input.scope, [
      { assetId: input.assetId, assetVersion: input.assetVersion, jobId: input.jobId },
    ], `Output produced after consent revocation (${input.identityId}).`);
    return { quarantined: true, reasonCode: "LATE_OUTPUT_QUARANTINED", revocationIds };
  }
  return { quarantined: false, reasonCode: "ALLOWED", revocationIds };
}
