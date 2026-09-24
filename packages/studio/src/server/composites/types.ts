/** Studio V5 composites — shared types and errors (STUDIO_15, server-only). */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { IdentityKind } from "../../contracts/identity";
import type { IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";

/** Typed composites-layer failure carrying a kernel API error code. */
export class CompositeError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "CompositeError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, this.retryable, this.details);
  }
}

export function compositeError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): CompositeError {
  return new CompositeError(code, message, details, retryable);
}

/** HTTP status projection for CompositeError codes (route adapters). */
export const COMPOSITE_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  QUOTE_EXPIRED: 410,
  APPROVAL_REQUIRED: 403,
  QUOTA_EXCEEDED: 429,
  POLICY_DENIED: 403,
  CONSENT_REQUIRED: 403,
  ENDPOINT_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export type CompositeKind = "marketing" | "influencer";

export const COMPOSITE_KINDS: readonly CompositeKind[] = ["marketing", "influencer"];

/** Supported format/aspect variants. Ratio as num:den in whole pixels. */
export interface AspectVariant {
  aspectId: string;
  label: string;
  width: number;
  height: number;
}

export const ASPECT_VARIANTS: Readonly<Record<string, AspectVariant>> = {
  "1:1": { aspectId: "1:1", label: "Square 1:1", width: 1080, height: 1080 },
  "9:16": { aspectId: "9:16", label: "Vertical 9:16", width: 1080, height: 1920 },
  "16:9": { aspectId: "16:9", label: "Widescreen 16:9", width: 1920, height: 1080 },
  "4:5": { aspectId: "4:5", label: "Portrait 4:5", width: 1080, height: 1350 },
};

/** One pinned identity reference carried by every variant. */
export interface PinnedIdentityRef {
  identityId: string;
  version: number;
  kind: IdentityKind;
  contentHash: string;
  consentGrantId: string | null;
}

/** WorkflowApp input selected by a composition template (never invented). */
export interface TemplateInputBinding {
  /** App form field name selected from the frozen WorkflowApp schema. */
  field: string;
  /** How the campaign fills it: brief text, identity ref, or soundtrack asset. */
  source: "brief" | "identity" | "soundtrack" | "aspect";
  required: boolean;
}

/**
 * Immutable versioned composition template. Templates are frozen with a
 * content hash; new versions append, old versions never mutate.
 */
export interface CompositionTemplate {
  templateId: string;
  version: number;
  kind: CompositeKind;
  title: string;
  description: string;
  /** Frozen WorkflowApp this template invokes (private workspace). */
  appId: string;
  aspectIds: readonly string[];
  inputs: readonly TemplateInputBinding[];
  /** Required identity kinds (e.g. marketing needs product + brand). */
  requiredIdentities: readonly IdentityKind[];
  contentHash: string;
  createdAt: string;
}

export type CampaignStatus = "draft" | "in_review" | "approved" | "delivering" | "delivered" | "stopped";

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "in_review",
  "approved",
  "delivering",
  "delivered",
  "stopped",
];

/** Campaign brief: audience/hook/cta/caption plus soundtrack + budget cap. */
export interface CampaignBrief {
  audience: string;
  hook: string;
  cta: string;
  caption: string;
  /** Soundtrack asset id, or null for silent. Rights checked at use. */
  soundtrackAssetId: string | null;
  /** Hard budget cap in integer ICU. Fanout never exceeds it. */
  capIcu: IcuAmount;
}

export interface CampaignRecord {
  campaignId: string;
  scope: ProjectScope;
  kind: CompositeKind;
  title: string;
  templateId: string;
  templateVersion: number;
  /**
   * Frozen WorkflowApp invoked for every variant (j12 app_id). Bound at
   * campaign creation from the project's existing apps; fanout validates
   * template fields against this app's frozen form schema.
   */
  appId: string | null;
  brief: CampaignBrief;
  /** One shared workflow job tree for every variant of this campaign. */
  jobTreeId: string;
  status: CampaignStatus;
  briefRevision: number;
  createdAt: string;
  updatedAt: string;
}

export type VariantStatus = "planned" | "queued" | "running" | "ready" | "failed" | "refused";

export const VARIANT_STATUSES: readonly VariantStatus[] = [
  "planned",
  "queued",
  "running",
  "ready",
  "failed",
  "refused",
];

/** One format/aspect child of a campaign. Identities pinned at fanout. */
export interface CampaignVariant {
  variantId: string;
  campaignId: string;
  scope: ProjectScope;
  aspectId: string;
  /** Pinned identity refs — same pinned versions across all children. */
  identities: readonly PinnedIdentityRef[];
  /** WorkflowApp payload hash for this variant (deterministic). */
  payloadHash: string;
  variantRevision: number;
  estimatedCostIcu: IcuAmount;
  /** Canonical child job id once admitted; null while planned/refused. */
  jobId: string | null;
  status: VariantStatus;
  /** Present when refused (budget) or failed. */
  refusalReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignReviewStatus = "requested" | "approved" | "denied" | "expired" | "cancelled";

export const CAMPAIGN_REVIEW_STATUSES: readonly CampaignReviewStatus[] = [
  "requested",
  "approved",
  "denied",
  "expired",
  "cancelled",
];

/**
 * Review handoff. Approval pins exact variant payload hashes; any variant
 * edit afterwards invalidates the approval (new review required).
 */
export interface CampaignReview {
  reviewId: string;
  campaignId: string;
  scope: ProjectScope;
  status: CampaignReviewStatus;
  /** variantId -> payloadHash pinned at request/approval time. */
  pinnedVariants: Readonly<Record<string, string>>;
  briefRevision: number;
  decidedBy: string | null;
  feedback: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Soundtrack rights as resolved by the caller from j03 at use time. */
export interface SoundtrackRights {
  assetId: string;
  hasCommercialGrant: boolean;
  hasExportGrant: boolean;
  providerAllowsPrivatePreview: boolean;
}

export type SoundtrackOperation = "preview" | "download" | "share" | "publish" | "export";

export interface SoundtrackDecision {
  allowed: boolean;
  reason: string;
  code: "SOUNDTRACK_OK" | "SOUNDTRACK_RIGHTS_UNKNOWN" | "SOUNDTRACK_PREVIEW_ONLY";
}

/** Minimal identity resolution surface composites consume (j10 IdentityPort). */
export interface CompositeIdentityPort {
  getBundle(
    identityId: string,
    version: number | null,
  ): Promise<{
    identityId: string;
    version: number;
    kind: IdentityKind;
    contentHash: string;
    consentGrantId: string | null;
    revokedAt: string | null;
  } | null>;
  checkUse(
    scope: ProjectScope,
    identityId: string,
    version: number,
    operation: "generate" | "preview" | "export" | "download" | "share" | "publish",
  ): Promise<{ allowed: boolean; reason: string }>;
}

/** WorkflowApp resolution surface composites consume (j12/j13 contracts). */
export interface CompositeAppPort {
  /** Resolve the frozen app definition by id (private workspace). */
  getApp(appId: string): Promise<{
    appId: string;
    frozenDagHash: string;
    inputs: readonly { name: string; required: boolean }[];
  } | null>;
}
