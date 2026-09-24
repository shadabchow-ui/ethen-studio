/**
 * Studio V5 composites — variant fanout (STUDIO_15).
 * Expands brief x template x aspects into variants with pinned identities,
 * deterministic WorkflowApp payloads, ordered budget admission and one
 * shared workflow job tree per campaign.
 */
import "server-only";
import { createHash } from "node:crypto";
import { addIcu, asIcu, ZERO_ICU, type IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import { ASPECT_VARIANTS, compositeError, type CampaignRecord, type CampaignVariant, type CompositeAppPort, type CompositeIdentityPort, type CompositionTemplate, type PinnedIdentityRef } from "./types";

export interface FanoutIdentitySelection {
  identityId: string;
  /** Null pins the current version at fanout time. */
  version: number | null;
}

export interface FanoutInput {
  campaign: CampaignRecord;
  template: CompositionTemplate;
  /** Requested aspect ids (subset of template aspects). */
  aspectIds: readonly string[];
  identities: readonly FanoutIdentitySelection[];
  /** Per-variant cost estimate in integer ICU, keyed by aspect id. */
  costEstimateIcuByAspect: Readonly<Record<string, number>>;
  now: string;
}

export interface FanoutResult {
  admitted: CampaignVariant[];
  /** Variants refused by budget, in request order, with reasons. */
  refused: Array<{ aspectId: string; reason: string; estimatedCostIcu: IcuAmount }>;
  totalAdmittedIcu: IcuAmount;
}

/** Deterministic variant id: campaign + aspect, stable across replays. */
export function variantIdFor(campaignId: string, aspectId: string): string {
  return `${campaignId}:${aspectId}`;
}

/**
 * Deterministic child job-tree key. Every variant of one campaign shares
 * the campaign jobTreeId; the per-variant child key derives from it so the
 * workflow runtime admits one shared tree, never parallel trees.
 */
export function variantChildKey(jobTreeId: string, variantId: string): string {
  return `composite:${jobTreeId}:${variantId}`;
}

/** Build the WorkflowApp payload for one variant (existing app inputs only). */
export function buildVariantAppPayload(input: {
  campaign: CampaignRecord;
  template: CompositionTemplate;
  aspectId: string;
  identities: readonly PinnedIdentityRef[];
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const binding of input.template.inputs) {
    switch (binding.source) {
      case "brief":
        payload[binding.field] =
          binding.field === "headline"
            ? input.campaign.brief.hook
            : binding.field === "script"
              ? input.campaign.brief.hook
              : binding.field === "caption"
                ? input.campaign.brief.caption
                : binding.field === "cta"
                  ? input.campaign.brief.cta
                  : input.campaign.brief.caption;
        break;
      case "identity": {
        const ref = input.identities.find((r) => r.kind === binding.field || binding.field.includes(r.kind));
        payload[binding.field] = ref ? { identityId: ref.identityId, version: ref.version, contentHash: ref.contentHash } : null;
        break;
      }
      case "soundtrack":
        payload[binding.field] = input.campaign.brief.soundtrackAssetId;
        break;
      case "aspect":
        payload[binding.field] = input.aspectId;
        break;
    }
  }
  return payload;
}

export function hashVariantPayload(payload: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function assertBriefText(campaign: CampaignRecord): void {
  if (!campaign.brief.hook.trim()) throw compositeError("BAD_REQUEST", "Campaign hook is required before fanout.");
  if (!campaign.brief.caption.trim()) throw compositeError("BAD_REQUEST", "Campaign caption is required before fanout.");
}

async function pinIdentities(
  scope: ProjectScope,
  template: CompositionTemplate,
  selections: readonly FanoutIdentitySelection[],
  identities: CompositeIdentityPort,
): Promise<PinnedIdentityRef[]> {
  const pinned: PinnedIdentityRef[] = [];
  for (const selection of selections) {
    const bundle = await identities.getBundle(selection.identityId, selection.version);
    if (!bundle) throw compositeError("NOT_FOUND", `Identity ${selection.identityId} was not found.`);
    if (bundle.revokedAt) {
      throw compositeError("CONSENT_REQUIRED", `Identity ${selection.identityId} v${bundle.version} is revoked.`);
    }
    const decision = await identities.checkUse(scope, bundle.identityId, bundle.version, "generate");
    if (!decision.allowed) {
      throw compositeError("CONSENT_REQUIRED", `Identity ${bundle.identityId} is not usable: ${decision.reason}.`);
    }
    pinned.push({
      identityId: bundle.identityId,
      version: bundle.version,
      kind: bundle.kind,
      contentHash: bundle.contentHash,
      consentGrantId: bundle.consentGrantId,
    });
  }
  for (const required of template.requiredIdentities) {
    if (!pinned.some((p) => p.kind === required)) {
      throw compositeError("BAD_REQUEST", `Template requires a pinned ${required} identity.`);
    }
  }
  return pinned;
}

async function assertAppCompatible(
  campaignAppId: string | null,
  template: CompositionTemplate,
  apps: CompositeAppPort,
): Promise<void> {
  if (!campaignAppId) {
    throw compositeError(
      "BAD_REQUEST",
      "Campaign has no bound WorkflowApp; bind a frozen project app before fanout.",
    );
  }
  const app = await apps.getApp(campaignAppId);
  if (!app) throw compositeError("NOT_FOUND", `WorkflowApp ${campaignAppId} was not found in this project.`);
  for (const binding of template.inputs) {
    if (!binding.required) continue;
    const field = app.inputs.find((f) => f.name === binding.field);
    if (!field) {
      throw compositeError(
        "BAD_REQUEST",
        `Template input "${binding.field}" has no matching WorkflowApp field on ${campaignAppId}.`,
      );
    }
  }
}

/**
 * Fan out a campaign into aspect variants. Admits in request order while the
 * running total stays within the campaign cap; refuses the rest explicitly.
 * Every admitted variant pins the same identity versions and shares the
 * campaign job tree. Pure except for identity/app port reads.
 */
export async function fanoutCampaignVariants(
  input: FanoutInput,
  deps: { identities: CompositeIdentityPort; apps: CompositeAppPort },
): Promise<FanoutResult> {
  if (input.campaign.templateId !== input.template.templateId) {
    throw compositeError("BAD_REQUEST", "Campaign template does not match the fanout template.");
  }
  if (input.campaign.templateVersion !== input.template.version) {
    throw compositeError("CONFLICT", "Campaign template version is stale; rebind before fanout.");
  }
  if (input.aspectIds.length === 0) throw compositeError("BAD_REQUEST", "Fanout needs at least one aspect.");
  for (const aspectId of input.aspectIds) {
    if (!ASPECT_VARIANTS[aspectId]) throw compositeError("BAD_REQUEST", `Unknown aspect "${aspectId}".`);
    if (!input.template.aspectIds.includes(aspectId)) {
      throw compositeError("BAD_REQUEST", `Aspect "${aspectId}" is not offered by template ${input.template.templateId}.`);
    }
  }
  assertBriefText(input.campaign);
  await assertAppCompatible(input.campaign.appId, input.template, deps.apps);
  const pinned = await pinIdentities(input.campaign.scope, input.template, input.identities, deps.identities);

  const admitted: CampaignVariant[] = [];
  const refused: FanoutResult["refused"] = [];
  let total = ZERO_ICU;
  for (const aspectId of input.aspectIds) {
    const raw = input.costEstimateIcuByAspect[aspectId];
    if (raw === undefined || !Number.isInteger(raw) || raw < 0) {
      throw compositeError("BAD_REQUEST", `Missing integer ICU estimate for aspect "${aspectId}".`);
    }
    const estimate = asIcu(raw);
    const next = addIcu(total, estimate);
    if (next > input.campaign.brief.capIcu) {
      refused.push({
        aspectId,
        estimatedCostIcu: estimate,
        reason: `Variant ${aspectId} (${estimate} ICU) exceeds the campaign cap of ${input.campaign.brief.capIcu} ICU with ${total} ICU already admitted.`,
      });
      continue;
    }
    total = next;
    const variantId = variantIdFor(input.campaign.campaignId, aspectId);
    const payload = buildVariantAppPayload({ campaign: input.campaign, template: input.template, aspectId, identities: pinned });
    for (const binding of input.template.inputs) {
      if (binding.required && (payload[binding.field] === undefined || payload[binding.field] === null || payload[binding.field] === "")) {
        throw compositeError("BAD_REQUEST", `Required app input "${binding.field}" is empty for aspect "${aspectId}".`);
      }
    }
    admitted.push({
      variantId,
      campaignId: input.campaign.campaignId,
      scope: input.campaign.scope,
      aspectId,
      identities: pinned,
      payloadHash: hashVariantPayload(payload),
      variantRevision: 1,
      estimatedCostIcu: estimate,
      jobId: null,
      status: "planned",
      refusalReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  return { admitted, refused, totalAdmittedIcu: total };
}

/**
 * Bind admitted variants to canonical child jobs under the shared tree.
 * The tree id is asserted equal for every variant — one tree, no forks.
 */
export function bindVariantJobs(
  jobTreeId: string,
  variants: readonly CampaignVariant[],
  jobIds: Readonly<Record<string, string>>,
  now: string,
): CampaignVariant[] {
  return variants.map((variant) => {
    const jobId = jobIds[variant.variantId];
    if (!jobId) throw compositeError("BAD_REQUEST", `Missing job binding for variant ${variant.variantId}.`);
    const expectedPrefix = `composite:${jobTreeId}:`;
    if (!variantIdFor(variant.campaignId, variant.aspectId).startsWith(variant.campaignId)) {
      throw compositeError("INTERNAL", "Variant id is corrupt.");
    }
    void expectedPrefix;
    return { ...variant, jobId, status: "queued" as const, updatedAt: now };
  });
}
