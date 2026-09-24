import "server-only";

/**
 * P04 — fixture-lane composites repository (RC-3 composites).
 *
 * Mirrors the `supabase-composites.ts` shapes the routes consume, backed
 * by `localStores().composites` (the kernel memory store, never a
 * rewrite). Routes branch onto these functions only when
 * `isStudioFixtureLane()` holds. Templates come from the registry's
 * kernel seeds; campaign create is first-write-wins per (scope,
 * idempotency key); brief edits CAS on the expected revision; reviews
 * run the review kernel (pin/decide/validity) over the same registry.
 */
import type { ProjectScope } from "@ethen/studio-core/contracts";
import {
  CompositeError,
  decideCampaignReview,
  requestCampaignReview,
  type CampaignBrief,
  type CampaignReview,
  type CampaignVariant,
  type CompositeKind,
  type CompositionTemplate,
  type MemoryCompositeStore,
} from "@ethen/studio-core/server/composites";
import type {
  CampaignRow,
  ReviewRow,
  TemplateRow,
  VariantRow,
} from "./supabase-composites";

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
}

function scopeKey(scope: ProjectScope): string {
  return `${String(scope.tenantId)}:${String(scope.workspaceId)}:${String(scope.projectId)}`;
}

export interface FixtureCompositeKeys {
  campaigns: Map<string, string>;
}

// ----------------------------------------------------------------- templates

function toTemplateRow(template: CompositionTemplate): TemplateRow {
  return {
    templateId: template.templateId,
    version: template.version,
    kind: template.kind,
    title: template.title,
    description: template.description,
    appId: template.appId,
    aspects: [...template.aspectIds],
    inputs: template.inputs.map((input) => ({ ...input })),
    requiredIdentities: [...template.requiredIdentities],
    contentHash: template.contentHash,
    createdAt: template.createdAt,
  };
}

export function fixtureListTemplates(store: MemoryCompositeStore, kind: CompositeKind | null): TemplateRow[] {
  return store.listTemplates(kind).map(toTemplateRow);
}

export function fixtureGetTemplate(
  store: MemoryCompositeStore,
  templateId: string,
  version: number,
): TemplateRow | null {
  const template = store.getTemplate(templateId, version);
  return template ? toTemplateRow(template) : null;
}

// ----------------------------------------------------------------- campaigns

function toCampaignRow(record: {
  campaignId: string;
  kind: string;
  title: string;
  templateId: string | null;
  templateVersion: number | null;
  appId: string | null;
  brief: CampaignBrief;
  jobTreeId: string;
  status: string;
  briefRevision: number;
  updatedAt: string;
}): CampaignRow {
  return {
    campaignId: record.campaignId,
    kind: record.kind,
    title: record.title,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    appId: record.appId,
    brief: { ...record.brief, capIcu: Number(record.brief.capIcu) },
    jobTreeId: record.jobTreeId,
    status: record.status,
    briefRevision: record.briefRevision,
    updatedAt: record.updatedAt,
  };
}

export function fixtureListCampaigns(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  kind: CompositeKind | null,
): CampaignRow[] {
  return store.listCampaigns(scope.scope, kind).map(toCampaignRow);
}

export function fixtureGetCampaign(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
): CampaignRow | null {
  try {
    return toCampaignRow(store.getCampaign(scope.scope, campaignId));
  } catch (error) {
    if (error instanceof CompositeError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) return null;
    throw error;
  }
}

export function fixtureInsertCampaign(
  store: MemoryCompositeStore,
  keys: FixtureCompositeKeys,
  scope: FixtureScope,
  input: {
    kind: CompositeKind;
    title: string;
    templateId: string;
    templateVersion: number;
    appId: string;
    brief: CampaignBrief;
    idempotencyKey: string;
  },
): CampaignRow {
  const seen = keys.campaigns.get(`${scopeKey(scope.scope)}:${input.idempotencyKey}`);
  if (seen) {
    const existing = fixtureGetCampaign(store, scope, seen);
    if (existing) return existing;
  }
  const now = new Date().toISOString();
  const created = store.createCampaign({
    scope: scope.scope,
    kind: input.kind,
    title: input.title,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    appId: input.appId,
    brief: input.brief,
    now,
  });
  keys.campaigns.set(`${scopeKey(scope.scope)}:${input.idempotencyKey}`, created.campaignId);
  return toCampaignRow(created);
}

/** CAS brief edit: expected-revision mismatches go stale, like Supabase. */
export function fixtureUpdateCampaignBrief(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
  brief: CampaignBrief,
  expectedRevision: number,
): CampaignRow {
  const current = store.getCampaign(scope.scope, campaignId);
  if (current.briefRevision !== expectedRevision) {
    throw new CompositeError("STALE_REVISION", "Campaign brief changed underneath this edit; reload and retry.");
  }
  return toCampaignRow(store.updateBrief(scope.scope, campaignId, brief, new Date().toISOString()));
}

// ------------------------------------------------------------------ variants

function toVariantRow(variant: CampaignVariant): VariantRow {
  return {
    variantId: variant.variantId,
    campaignId: variant.campaignId,
    aspectId: variant.aspectId,
    identities: variant.identities.map((identity) => ({ ...identity })),
    payloadHash: variant.payloadHash,
    variantRevision: variant.variantRevision,
    estimatedCostIcu: Number(variant.estimatedCostIcu),
    jobId: variant.jobId,
    status: variant.status,
    refusalReason: variant.refusalReason,
    updatedAt: variant.updatedAt,
  };
}

export function fixtureListVariants(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
): VariantRow[] {
  return store.listVariants(scope.scope, campaignId).map(toVariantRow);
}

/** Kernel variant records for fanout/review flows (hashes stay kernel-held). */
export function fixtureListVariantRecords(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
): CampaignVariant[] {
  return store.listVariants(scope.scope, campaignId);
}

export function fixtureSaveFanout(
  store: MemoryCompositeStore,
  fanout: { admitted: readonly CampaignVariant[] },
): void {
  store.saveFanout(fanout as Parameters<MemoryCompositeStore["saveFanout"]>[0]);
}

// ------------------------------------------------------------------- reviews

function toReviewRow(review: CampaignReview): ReviewRow {
  return {
    reviewId: review.reviewId,
    campaignId: review.campaignId,
    status: review.status,
    pinnedVariants: { ...review.pinnedVariants },
    briefRevision: review.briefRevision,
    decidedBy: review.decidedBy,
    feedback: review.feedback,
    expiresAt: review.expiresAt,
    updatedAt: review.updatedAt,
  };
}

export function fixtureListReviews(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
): ReviewRow[] {
  return store.listReviews(scope.scope, campaignId).map(toReviewRow);
}

export function fixtureRequestCampaignReview(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
  expiresAt: string | null,
): ReviewRow {
  const campaign = store.getCampaign(scope.scope, campaignId);
  const variants = store.listVariants(scope.scope, campaignId);
  const review = requestCampaignReview({
    campaignId,
    scope: scope.scope,
    variants,
    briefRevision: campaign.briefRevision,
    expiresAt,
    now: new Date().toISOString(),
  });
  store.saveReview(review);
  return toReviewRow(review);
}

export function fixtureDecideCampaignReview(
  store: MemoryCompositeStore,
  scope: FixtureScope,
  campaignId: string,
  reviewId: string,
  decision: "approved" | "denied",
  decidedBy: string,
  feedback: string | null,
): ReviewRow {
  const campaign = store.getCampaign(scope.scope, campaignId);
  const review = store.getReview(scope.scope, reviewId);
  if (review.campaignId !== campaignId) {
    throw new CompositeError("NOT_FOUND", "Review was not found.");
  }
  const variants = store.listVariants(scope.scope, campaignId);
  const decided = decideCampaignReview(
    review,
    decision,
    decidedBy,
    feedback,
    variants,
    campaign.briefRevision,
    new Date().toISOString(),
  );
  store.saveReview(decided);
  return toReviewRow(decided);
}
