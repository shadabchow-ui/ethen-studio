/**
 * Studio V5 policy — extraction wrappers for existing Voice consent imports
 * (STUDIO_03, server-only). Recovery sources stay read-only; these pure
 * mappers translate legacy evidence into V5 grants with provenance.
 *
 * Existing grants are never assumed valid merely because a legacy row
 * exists: active legacy rows import as `unknown` (blocked until a V5
 * re-verification grant supersedes them). Revoked/expired import as
 * revoked/expired. History is preserved, never rewritten.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { policyError } from "./types";
import type { ConsentGrant, ConsentGrantInput, ConsentVerification } from "./types";

/** Structural subset of the legacy VoiceConsentRecord (migration 0033). */
export interface LegacyVoiceConsentRecord {
  id: string;
  projectId: string;
  userId: string;
  ownerName: string;
  ownerRelationship: string;
  consentStatus: "active" | "revoked" | "expired" | "needs_review" | string;
  consentScope: string;
  allowedProviders: string[];
  consentedAt: string;
  revokedAt: string | null;
  termsVersion: string;
  abuseReportRef?: string | null;
}

/** Structural subset of VoiceConsentV2 (user-declared, never verified in V1). */
export interface LegacyVoiceConsentV2Record {
  id: string;
  actorId: string;
  subjectName: string;
  status: "active" | "revoked" | "expired" | "needs_review";
  purpose: string;
  channels: string[];
  commercialScope: string;
  geography: string[];
  allowedProviders: string[];
  operations: string[];
  termsVersion: string;
  consentedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  payloadHash: string;
  abuseReportRef: string | null;
}

function verificationFor(): ConsentVerification {
  // Legacy verification claims are user-declared and unverifiable here.
  return "unknown";
}

/** Map a legacy Voice record to a V5 grant (unknown until re-verified). */
export function importVoiceLegacyConsent(
  scope: ProjectScope,
  identityId: string,
  record: LegacyVoiceConsentRecord,
  now?: string,
): ConsentGrant {
  if (!record.id.trim()) throw policyError("BAD_REQUEST", "legacy consent id is required.");
  void now;
  const revoked = record.consentStatus === "revoked" || record.revokedAt !== null;
  const status = revoked ? "revoked"
    : record.consentStatus === "expired" ? "expired"
    : record.consentStatus === "needs_review" ? "needs_review"
    : "unknown";
  return {
    grantId: randomUUID(),
    scope,
    identityId,
    identityVersion: null,
    actorId: record.userId,
    subjectRef: record.ownerName,
    purpose: `legacy:${record.consentScope}`,
    operations: ["generate"],
    channels: [],
    commercialScope: "unknown",
    geography: [],
    allowedProviders: [...record.allowedProviders],
    termsVersion: record.termsVersion,
    verificationState: verificationFor(),
    status,
    provenance: "voice_legacy",
    legacyRef: record.id,
    supersedes: null,
    grantedAt: record.consentedAt,
    expiresAt: null,
    payloadHash: null,
  };
}

/** Map a VoiceConsentV2 record to a V5 grant (unknown until re-verified). */
export function importVoiceV2Consent(
  scope: ProjectScope,
  identityId: string,
  record: LegacyVoiceConsentV2Record,
): ConsentGrant {
  if (!record.id.trim()) throw policyError("BAD_REQUEST", "legacy consent id is required.");
  const status = record.status === "active" ? "unknown" : record.status;
  return {
    grantId: randomUUID(),
    scope,
    identityId,
    identityVersion: null,
    actorId: record.actorId,
    subjectRef: record.subjectName,
    purpose: record.purpose,
    operations: [...record.operations],
    channels: [...record.channels],
    commercialScope: record.commercialScope,
    geography: [...record.geography],
    allowedProviders: [...record.allowedProviders],
    termsVersion: record.termsVersion,
    verificationState: verificationFor(),
    status,
    provenance: "voice_v2",
    legacyRef: record.id,
    supersedes: null,
    grantedAt: record.consentedAt,
    expiresAt: record.expiresAt,
    payloadHash: record.payloadHash,
  };
}

export interface ReverifyInput {
  importedGrantId: string;
  actorId: string;
  termsVersion: string;
  operations: readonly string[];
  channels?: readonly string[];
  expiresAt?: string | null;
}

/**
 * Build the input for a re-verification grant that supersedes an imported
 * unknown grant. The imported row is left untouched (append-only).
 */
export function reverifyConsentInput(
  imported: ConsentGrant,
  input: ReverifyInput,
): { scope: ProjectScope; grant: ConsentGrantInput } {
  if (imported.grantId !== input.importedGrantId) {
    throw policyError("BAD_REQUEST", "re-verification must reference the imported grant.");
  }
  if (imported.provenance === "studio_v5") {
    throw policyError("BAD_REQUEST", "studio_v5 grants do not need re-verification.");
  }
  return {
    scope: imported.scope,
    grant: {
      identityId: imported.identityId,
      identityVersion: imported.identityVersion,
      actorId: input.actorId,
      subjectRef: imported.subjectRef,
      purpose: imported.purpose,
      operations: input.operations,
      channels: input.channels ?? imported.channels,
      termsVersion: input.termsVersion,
      verificationState: "user_declared",
      expiresAt: input.expiresAt ?? null,
      supersedes: imported.grantId,
    },
  };
}
