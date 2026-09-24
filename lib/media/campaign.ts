/**
 * Studio V2 Job 09 — gated campaign beta.
 * Campaigns bound deliverable sets by verified brand state, approved
 * claims, budget, review, and authorized delivery — with no separate asset
 * store or runtime. Execution reuses director plans; delivery reuses export
 * jobs with approvals pinned. Gated behind STUDIO_CAMPAIGN_BETA plus
 * project membership (route-level).
 */

import { createHash, randomUUID } from "node:crypto";
import type { StudioPersistenceRecord, StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";

export type CampaignStatus = "draft" | "review" | "approved" | "delivering" | "delivered" | "stopped";

const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ["review", "stopped"],
  review: ["approved", "draft", "stopped"],
  approved: ["delivering", "stopped"],
  delivering: ["delivered", "stopped"],
  delivered: [],
  stopped: [],
};

export function transitionCampaignStatus(from: CampaignStatus, to: CampaignStatus): void {
  if (!CAMPAIGN_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`CAMPAIGN_TRANSITION: ${from} -> ${to} is not legal.`);
  }
}

/** Beta gate: campaigns exist only when explicitly enabled. */
export function requireCampaignBeta(env: NodeJS.ProcessEnv = process.env): void {
  if (env.STUDIO_CAMPAIGN_BETA !== "1") {
    throw new Error("CAMPAIGN_BETA_DISABLED: campaign beta is not enabled.");
  }
}

export interface CampaignClaim {
  id: string;
  text: string;
  status: "pending" | "approved";
}

function nowIso(): string {
  return new Date().toISOString();
}

function payloadOf(row: StudioPersistenceRecord): Record<string, unknown> {
  return row.payload as Record<string, unknown>;
}

function revisionOf(row: StudioPersistenceRecord): number {
  const revision = payloadOf(row).revision;
  return typeof revision === "number" ? revision : 1;
}

function claimsHash(claims: CampaignClaim[]): string {
  return createHash("sha256")
    .update(JSON.stringify(claims.map((claim) => ({ id: claim.id, text: claim.text, status: claim.status })).sort((a, b) => a.id.localeCompare(b.id))))
    .digest("hex");
}

export async function createCampaign(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { title: string; brandRef?: string; productRef?: string; budgetCeiling?: number; idempotencyKey?: string },
): Promise<string> {
  if (!input.title?.trim()) throw new Error("CAMPAIGN_INVALID: title is required.");
  const ceiling = input.budgetCeiling ?? 0;
  if (!Number.isFinite(ceiling) || ceiling < 0) throw new Error("CAMPAIGN_INVALID: budget ceiling must be >= 0.");
  const key = input.idempotencyKey?.trim() || `cmp-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("CAMPAIGN_INVALID: idempotency key must be 8-128 chars.");
  const existing = (await repo.list(scope, "studio_campaigns")).find(
    (row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === key,
  );
  if (existing) return existing.id;
  const id = randomUUID();
  const at = nowIso();
  await repo.insert(scope, "studio_campaigns", {
    id,
    payload: {
      title: input.title.trim(), brand_ref: input.brandRef?.trim() ?? "", product_ref: input.productRef?.trim() ?? "",
      brand_deliverable_id: null, status: "draft", revision: 1, budget_ceiling: ceiling,
      plan_id: null, claims: [], claim_freeze: {}, export_id: null, idempotency_key: key,
      accepted_by: null, accepted_at: null,
    },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  return id;
}

export interface BrandVerification {
  verified: boolean;
  reason: string;
}

/**
 * Brand state is verified only through a locked deliverable: the brand
 * record exists and its current lock digest still matches. Anything else
 * is recorded text, never verification.
 */
export async function verifyBrandState(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  brandDeliverableId: string,
): Promise<BrandVerification> {
  if (!brandDeliverableId) return { verified: false, reason: "no brand deliverable bound" };
  const deliverable = await repo.get(scope, "studio_deliverables", brandDeliverableId).catch(() => null);
  if (!deliverable) return { verified: false, reason: "brand deliverable is not in this project" };
  const locks = await repo.list(scope, "studio_decision_locks").catch(() => []);
  const current = locks.find((row) => {
    const data = payloadOf(row);
    return String(data.entity_kind ?? "") === "deliverable"
      && String(data.entity_id ?? "") === brandDeliverableId
      && (data.superseded_by ?? null) === null;
  });
  if (!current) return { verified: false, reason: "brand deliverable has no current lock" };
  return { verified: true, reason: "locked deliverable intact" };
}

export async function setCampaignBrand(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  campaignId: string,
  brandDeliverableId: string,
): Promise<BrandVerification> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  if (payloadOf(campaign).status !== "draft") throw new Error("CAMPAIGN_TRANSITION: brand binds in draft only.");
  const verification = await verifyBrandState(repo, scope, brandDeliverableId);
  if (!verification.verified) throw new Error(`CAMPAIGN_BRAND: ${verification.reason}.`);
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { brand_deliverable_id: brandDeliverableId });
  return verification;
}

export async function setCampaignClaims(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  campaignId: string,
  claims: Array<{ id?: string; text: string }>,
): Promise<CampaignClaim[]> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  if (payloadOf(campaign).status !== "draft") throw new Error("CAMPAIGN_TRANSITION: claims edit in draft only.");
  const normalized: CampaignClaim[] = claims.map((claim, index) => {
    if (!claim.text?.trim()) throw new Error("CAMPAIGN_INVALID: claim text is required.");
    return { id: claim.id?.trim() || `claim-${index + 1}`, text: claim.text.trim(), status: "pending" as const };
  });
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { claims: normalized });
  return normalized;
}

/** Approve every claim at once, freezing the claim hash. Claim text is immutable after this. */
export async function approveCampaignClaims(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  campaignId: string,
): Promise<string> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  const data = payloadOf(campaign);
  if (data.status !== "draft" && data.status !== "review") {
    throw new Error("CAMPAIGN_TRANSITION: claims approve in draft or review.");
  }
  const claims = ((data.claims ?? []) as CampaignClaim[]).map((claim) => ({ ...claim, status: "approved" as const }));
  if (claims.length === 0) throw new Error("CAMPAIGN_INVALID: no claims to approve.");
  const freeze = { hash: claimsHash(claims), approvedBy: scope.actorId, approvedAt: nowIso() };
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { claims, claim_freeze: freeze });
  return freeze.hash;
}

/** Claim preservation: frozen hash must still match (call before delivery). */
export function verifyClaimFreeze(campaign: StudioPersistenceRecord): void {
  const data = payloadOf(campaign);
  const freeze = (data.claim_freeze ?? {}) as { hash?: string };
  const claims = ((data.claims ?? []) as CampaignClaim[]);
  if (!freeze.hash) throw new Error("CAMPAIGN_CLAIMS: claims were never approved.");
  if (!claims.every((claim) => claim.status === "approved")) throw new Error("CAMPAIGN_CLAIMS: unapproved claims present.");
  if (claimsHash(claims) !== freeze.hash) throw new Error("CAMPAIGN_CLAIMS: claim text moved after approval.");
}

export async function linkCampaignPlan(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  campaignId: string,
  planId: string,
): Promise<void> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  if (payloadOf(campaign).status !== "draft") throw new Error("CAMPAIGN_TRANSITION: plans link in draft only.");
  const plan = await repo.get(scope, "studio_director_plans", planId);
  if (!plan) throw new Error("CAMPAIGN_NOT_FOUND: plan is not in this project.");
  const planData = payloadOf(plan);
  if (planData.status !== "accepted" && planData.status !== "running" && planData.status !== "completed") {
    throw new Error("CAMPAIGN_PLAN: linked plan must be accepted or beyond.");
  }
  const planCeiling = Number(planData.budget_ceiling ?? 0);
  const campaignCeiling = Number(payloadOf(campaign).budget_ceiling ?? 0);
  if (planCeiling > campaignCeiling) {
    throw new Error(`CAMPAIGN_BUDGET: plan ceiling ${planCeiling} exceeds campaign ceiling ${campaignCeiling}.`);
  }
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { plan_id: planId });
}

export async function reviewCampaign(repo: StudioRepository, scope: StudioPersistenceScope, campaignId: string): Promise<void> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  transitionCampaignStatus(payloadOf(campaign).status as CampaignStatus, "review");
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { status: "review" });
}

export async function acceptCampaign(repo: StudioRepository, scope: StudioPersistenceScope, campaignId: string): Promise<void> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  const data = payloadOf(campaign);
  if (data.status !== "review") throw new Error("CAMPAIGN_TRANSITION: accept from review only.");
  const brand = await verifyBrandState(repo, scope, String(data.brand_deliverable_id ?? ""));
  if (!brand.verified) throw new Error(`CAMPAIGN_BRAND: ${brand.reason}.`);
  verifyClaimFreeze(campaign);
  transitionCampaignStatus(data.status as CampaignStatus, "approved");
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), {
    status: "approved", accepted_by: scope.actorId, accepted_at: nowIso(),
  });
}

export async function stopCampaign(repo: StudioRepository, scope: StudioPersistenceScope, campaignId: string): Promise<void> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  transitionCampaignStatus(payloadOf(campaign).status as CampaignStatus, "stopped");
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { status: "stopped" });
}

export interface CampaignDelivery {
  exportId: string;
  manifestHash: string;
}

/**
 * Approved delivery: re-verifies brand, claims, and budget, then creates an
 * export job with plan acceptance + locks pinned. Delivery without approval
 * is denied, never queued.
 */
export async function deliverCampaign(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  campaignId: string,
  input: { assetIds: string[]; title?: string; idempotencyKey?: string },
  deps: { executeExport?: typeof import("./export-jobs").executeExportJob } = {},
): Promise<CampaignDelivery> {
  const campaign = await repo.get(scope, "studio_campaigns", campaignId);
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND: no such campaign in this project.");
  const data = payloadOf(campaign);
  if (data.status !== "approved") throw new Error("CAMPAIGN_DELIVERY: delivery requires an approved campaign.");
  const brand = await verifyBrandState(repo, scope, String(data.brand_deliverable_id ?? ""));
  if (!brand.verified) throw new Error(`CAMPAIGN_BRAND: ${brand.reason}.`);
  verifyClaimFreeze(campaign);
  transitionCampaignStatus("approved", "delivering");
  await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(campaign), { status: "delivering" });
  const executeExport = deps.executeExport ?? (await import("./export-jobs")).executeExportJob;
  const key = input.idempotencyKey?.trim() || `campaign-${campaignId.slice(0, 8)}-delivery`;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("CAMPAIGN_INVALID: delivery key must be 8-128 chars.");
  try {
    const result = await executeExport(repo, scope, key, {
      preset: "handoff-zip",
      assetIds: input.assetIds,
      planId: typeof data.plan_id === "string" ? (data.plan_id as string) : null,
      title: input.title?.trim() || String(data.title ?? "campaign"),
    }, {});
    const delivered = await repo.get(scope, "studio_campaigns", campaignId);
    if (!delivered) throw new Error("CAMPAIGN_NOT_FOUND: campaign vanished mid-delivery.");
    transitionCampaignStatus(payloadOf(delivered).status as CampaignStatus, "delivered");
    await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(delivered), { status: "delivered", export_id: result.exportId });
    return { exportId: result.exportId, manifestHash: result.manifestHash };
  } catch (error) {
    const fresh = await repo.get(scope, "studio_campaigns", campaignId);
    if (fresh) {
      transitionCampaignStatus("delivering", "stopped");
      await repo.updateIfRevision(scope, "studio_campaigns", campaignId, revisionOf(fresh), { status: "stopped" }).catch(() => null);
    }
    throw error;
  }
}
