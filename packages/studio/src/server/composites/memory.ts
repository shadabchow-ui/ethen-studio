/** Studio V5 composites — in-memory store for tests and local flows (STUDIO_15). */
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import { hashVariantPayload, type FanoutResult } from "./variants";
import {
  compositeError,
  type CampaignBrief,
  type CampaignRecord,
  type CampaignReview,
  type CampaignVariant,
  type CompositeKind,
  type CompositionTemplate,
} from "./types";

function scopeKey(scope: ProjectScope): string {
  return `${scope.tenantId}/${scope.workspaceId}/${scope.projectId}`;
}

function assertScope(recordScope: ProjectScope, scope: ProjectScope, what: string): void {
  if (recordScope.tenantId !== scope.tenantId || recordScope.projectId !== scope.projectId) {
    throw compositeError("FORBIDDEN", `${what} is outside the current project scope.`);
  }
}

export class MemoryCompositeStore {
  private readonly templates = new Map<string, CompositionTemplate>();
  private readonly campaigns = new Map<string, CampaignRecord>();
  private readonly variants = new Map<string, CampaignVariant>();
  private readonly reviews = new Map<string, CampaignReview>();

  // -- templates (append-only versions) ------------------------------------

  putTemplate(template: CompositionTemplate): void {
    const key = `${template.templateId}:v${template.version}`;
    const existing = this.templates.get(key);
    if (existing && existing.contentHash !== template.contentHash) {
      throw compositeError("CONFLICT", "Template versions are immutable.");
    }
    this.templates.set(key, template);
  }

  getTemplate(templateId: string, version: number): CompositionTemplate | null {
    return this.templates.get(`${templateId}:v${version}`) ?? null;
  }

  listTemplates(kind: CompositeKind | null): CompositionTemplate[] {
    return [...this.templates.values()]
      .filter((t) => !kind || t.kind === kind)
      .sort((a, b) => (a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : a.version - b.version));
  }

  // -- campaigns ------------------------------------------------------------

  createCampaign(input: {
    scope: ProjectScope;
    kind: CompositeKind;
    title: string;
    templateId: string;
    templateVersion: number;
    appId: string | null;
    brief: CampaignBrief;
    now: string;
  }): CampaignRecord {
    const template = this.getTemplate(input.templateId, input.templateVersion);
    if (!template) throw compositeError("NOT_FOUND", `Template ${input.templateId} v${input.templateVersion} was not found.`);
    if (template.kind !== input.kind) throw compositeError("BAD_REQUEST", "Campaign kind must match its template kind.");
    if (!input.title.trim()) throw compositeError("BAD_REQUEST", "Campaign title is required.");
    const campaign: CampaignRecord = {
      campaignId: randomUUID(),
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      appId: input.appId,
      brief: { ...input.brief },
      jobTreeId: randomUUID(),
      status: "draft",
      briefRevision: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.campaigns.set(campaign.campaignId, campaign);
    return campaign;
  }

  getCampaign(scope: ProjectScope, campaignId: string): CampaignRecord {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw compositeError("NOT_FOUND", "Campaign was not found.");
    assertScope(campaign.scope, scope, "Campaign");
    return campaign;
  }

  listCampaigns(scope: ProjectScope, kind: CompositeKind | null): CampaignRecord[] {
    return [...this.campaigns.values()]
      .filter((c) => c.scope.projectId === scope.projectId && (!kind || c.kind === kind))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  /** Brief edits bump the brief revision and return the campaign to draft. */
  updateBrief(scope: ProjectScope, campaignId: string, brief: CampaignBrief, now: string): CampaignRecord {
    const campaign = this.getCampaign(scope, campaignId);
    if (campaign.status === "delivering" || campaign.status === "delivered") {
      throw compositeError("CONFLICT", `Campaign is ${campaign.status}; brief edits are closed.`);
    }
    const next: CampaignRecord = {
      ...campaign,
      brief: { ...brief },
      briefRevision: campaign.briefRevision + 1,
      status: "draft",
      updatedAt: now,
    };
    this.campaigns.set(campaignId, next);
    return next;
  }

  setCampaignStatus(scope: ProjectScope, campaignId: string, status: CampaignRecord["status"], now: string): CampaignRecord {
    const campaign = this.getCampaign(scope, campaignId);
    const next = { ...campaign, status, updatedAt: now };
    this.campaigns.set(campaignId, next);
    return next;
  }

  // -- variants ---------------------------------------------------------------

  saveFanout(fanout: FanoutResult): void {
    for (const variant of fanout.admitted) {
      const key = variant.variantId;
      const existing = this.variants.get(key);
      if (existing && existing.payloadHash !== variant.payloadHash && existing.variantRevision >= variant.variantRevision) {
        throw compositeError("CONFLICT", `Variant ${key} already exists with a different payload; edit it instead.`);
      }
      this.variants.set(key, variant);
    }
  }

  listVariants(scope: ProjectScope, campaignId: string): CampaignVariant[] {
    const campaign = this.getCampaign(scope, campaignId);
    void campaign;
    return [...this.variants.values()]
      .filter((v) => v.campaignId === campaignId)
      .sort((a, b) => (a.aspectId < b.aspectId ? -1 : 1));
  }

  getVariant(scope: ProjectScope, variantId: string): CampaignVariant {
    const variant = this.variants.get(variantId);
    if (!variant) throw compositeError("NOT_FOUND", "Variant was not found.");
    assertScope(variant.scope, scope, "Variant");
    return variant;
  }

  /**
   * Edit a variant payload (caption/hook override). Bumps the revision and
   * rehashes, which invalidates any pinned review. Identity pins are
   * preserved — edits never silently swap identities.
   */
  editVariantPayload(
    scope: ProjectScope,
    variantId: string,
    payload: Readonly<Record<string, unknown>>,
    now: string,
  ): CampaignVariant {
    const variant = this.getVariant(scope, variantId);
    if (variant.status === "queued" || variant.status === "running") {
      throw compositeError("CONFLICT", `Variant ${variantId} is ${variant.status}; queued work cannot be edited.`);
    }
    const next: CampaignVariant = {
      ...variant,
      payloadHash: hashVariantPayload(payload),
      variantRevision: variant.variantRevision + 1,
      status: "planned",
      jobId: null,
      updatedAt: now,
    };
    this.variants.set(variantId, next);
    return next;
  }

  bindVariantJobs(scope: ProjectScope, jobTreeId: string, jobIds: Readonly<Record<string, string>>, now: string): CampaignVariant[] {
    const bound: CampaignVariant[] = [];
    for (const [variantId, jobId] of Object.entries(jobIds)) {
      const variant = this.getVariant(scope, variantId);
      const next = { ...variant, jobId, status: "queued" as const, updatedAt: now };
      this.variants.set(variantId, next);
      bound.push(next);
    }
    void jobTreeId;
    return bound;
  }

  // -- reviews -----------------------------------------------------------------

  saveReview(review: CampaignReview): void {
    assertScope(review.scope, review.scope, "Review");
    this.reviews.set(review.reviewId, review);
  }

  getReview(scope: ProjectScope, reviewId: string): CampaignReview {
    const review = this.reviews.get(reviewId);
    if (!review) throw compositeError("NOT_FOUND", "Review was not found.");
    assertScope(review.scope, scope, "Review");
    return review;
  }

  listReviews(scope: ProjectScope, campaignId: string): CampaignReview[] {
    this.getCampaign(scope, campaignId);
    return [...this.reviews.values()]
      .filter((r) => r.campaignId === campaignId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  scopeTag(scope: ProjectScope): string {
    return scopeKey(scope);
  }
}

export function createMemoryCompositeStore(): MemoryCompositeStore {
  return new MemoryCompositeStore();
}
