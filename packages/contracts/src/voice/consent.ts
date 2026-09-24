/**
 * packages/contracts/voice/consent.ts
 *
 * VOI-13 — future-proof consent schema.
 *
 * The legacy VoiceConsentRecord (migration 0033) remains the live
 * user-declared record. This module defines the strengthened schema for
 * future tracks: subject attestation, source asset hashes, exact
 * operation/provider/model/purpose/channels/commercial scope/
 * geography/expiry/revocation/payload hash/approval/output assets. It never
 * self-upgrades verification state and never enables cloning in V1.
 */

export type ConsentVerificationState = "user_declared" | "platform_verified";
export type ConsentCloningEligibility = "never_v1";

export interface VoiceConsentSubject {
  /** Declared subject name (user-declared, unverified). */
  name: string;
  /** Declared relationship of the actor to the subject. */
  relationship: string;
  /** Declared attestation text (user-declared, unverified). */
  attestation: string;
  /** Declared age band; "minor" is always blocked. */
  ageBand: "adult" | "minor" | "unknown";
  /** True when the actor declares they are the subject. */
  declaresSelf: boolean;
}

export interface VoiceConsentV2 {
  id: string;
  projectId: string;
  organizationId: string;
  actorId: string;
  subject: VoiceConsentSubject;
  status: "active" | "revoked" | "expired" | "needs_review";
  purpose: string;
  channels: string[];
  commercialScope: string;
  geography: string[];
  allowedProviders: string[];
  modelIds: string[];
  operations: string[];
  /** Hashes of the exact source assets the consent covers. */
  sourceAssetHashes: string[];
  /** Hash of the consented payload/terms snapshot. */
  payloadHash: string;
  termsVersion: string;
  consentedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  /** NEVER user-upgradeable (pass condition 3). */
  verificationState: ConsentVerificationState;
  /** Hard-fixed for V1 (pass condition 2). */
  cloningEligibility: ConsentCloningEligibility;
  /** Future approval reference (VOI-12 approvals) — informational in V1. */
  approvalRef: string | null;
  outputAssetIds: string[];
  abuseReportRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CONSENT_V2_TERMS_VERSION = "voice-consent-v2-2026-08";

/** V1 invariant: consent can never be cloning-eligible. */
export const V1_CLONING_ELIGIBILITY: ConsentCloningEligibility = "never_v1";

/** V1 invariant: verification never upgrades from user_declared. */
export const V1_VERIFICATION_STATE: ConsentVerificationState = "user_declared";
