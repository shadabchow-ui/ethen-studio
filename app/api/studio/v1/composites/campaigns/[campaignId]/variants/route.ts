import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  CompositeError,
  fanoutCampaignVariants,
  type CompositionTemplate,
} from "@ethen/studio-core/server/composites";
import { asIcu } from "@ethen/studio-core/contracts";
import { checkIdentityUse, toBundle, type IdentityKind } from "@ethen/studio-core/server/identity";
import { requireServiceClient, resolveProjectScope } from "../../../../_lib/supabase-data";
import { getCampaign, getTemplate, listVariants, upsertVariant } from "../../../../_lib/supabase-composites";
import { getIdentityHead, listIdentityVersions, resolveConsentSnapshot } from "../../../../_lib/supabase-identity";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureGetCampaign,
  fixtureGetTemplate,
  fixtureListVariants,
  fixtureSaveFanout,
} from "../../../../_lib/composites-lane";
import { getMemoryIdentityRepository } from "../../../../_lib/memory-identity";

export const dynamic = "force-dynamic";

function asCompositeFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Campaigns need the Studio data service.");
  if (setup) return setup;
  if (error instanceof CompositeError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
    if (error.code === "CONSENT_REQUIRED") return studioError("CONSENT_REQUIRED", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Composites request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_15 — V1 variant fanout. POST expands the campaign brief across the
 * requested aspects through the kernel: identities pinned via j10, template
 * fields validated against the bound frozen WorkflowApp, budget admitted in
 * order under the campaign cap. GET lists variants.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ campaignId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { campaignId } = await context.params;
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ variants: fixtureListVariants(localStores().composites, resolved, campaignId) });
    }
    return studioSuccess({ variants: await listVariants(resolved, campaignId) });
  } catch (error) {
    return asCompositeFailure(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { campaignId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const campaign = lane ? fixtureGetCampaign(lane.composites, resolved, campaignId) : await getCampaign(resolved, campaignId);
    if (!campaign) return studioError("NOT_FOUND", "Campaign was not found.");
    if (!campaign.templateId || !campaign.templateVersion) {
      return studioError("VALIDATION_ERROR", "Legacy-imported campaigns cannot fan out without a template binding.");
    }
    const templateRow = lane
      ? fixtureGetTemplate(lane.composites, campaign.templateId, campaign.templateVersion)
      : await getTemplate(campaign.templateId, campaign.templateVersion);
    if (!templateRow) return studioError("NOT_FOUND", "Campaign template was not found.");
    const template: CompositionTemplate = {
      templateId: templateRow.templateId,
      version: templateRow.version,
      kind: templateRow.kind as CompositionTemplate["kind"],
      title: templateRow.title,
      description: templateRow.description,
      appId: templateRow.appId,
      aspectIds: templateRow.aspects,
      inputs: (templateRow.inputs as CompositionTemplate["inputs"]) ?? [],
      requiredIdentities: templateRow.requiredIdentities as IdentityKind[],
      contentHash: templateRow.contentHash,
      createdAt: templateRow.createdAt,
    };

    const aspectIds = Array.isArray(body.aspectIds)
      ? (body.aspectIds as unknown[]).filter((a): a is string => typeof a === "string")
      : [];
    if (aspectIds.length === 0) return studioError("VALIDATION_ERROR", "aspectIds is required.");
    const identities = Array.isArray(body.identities)
      ? (body.identities as Array<{ identityId?: unknown; version?: unknown }>).map((entry) => ({
          identityId: String(entry.identityId ?? ""),
          version: typeof entry.version === "number" ? entry.version : null,
        }))
      : [];
    if (identities.length === 0 || identities.some((i) => !i.identityId)) {
      return studioError("VALIDATION_ERROR", "identities (pinned identity refs) are required.");
    }
    const costEstimateIcuByAspect = (body.costEstimateIcuByAspect ?? {}) as Record<string, unknown>;

    const memoryIdentities = lane ? getMemoryIdentityRepository() : null;
    const identityPort = {
      getBundle: async (identityId: string, version: number | null) => {
        if (memoryIdentities) {
          const head = memoryIdentities.getIdentity(resolved.scope, identityId);
          if (!head) return null;
          const versions = memoryIdentities.listVersions(resolved.scope, identityId);
          const record = version === null ? versions[versions.length - 1] : versions.find((v) => v.version === version);
          if (!record) return null;
          return toBundle(head, record);
        }
        const head = await getIdentityHead(resolved, identityId);
        if (!head) return null;
        const versions = await listIdentityVersions(resolved, identityId);
        const record = version === null ? versions[versions.length - 1] : versions.find((v) => v.version === version);
        if (!record) return null;
        return toBundle(head, record);
      },
      checkUse: async (
        scope: Parameters<Parameters<typeof fanoutCampaignVariants>[1]["identities"]["checkUse"]>[0],
        identityId: string,
        version: number,
        operation: "generate" | "preview" | "export" | "download" | "share" | "publish",
      ) => {
        void scope;
        if (memoryIdentities) {
          const consent = memoryIdentities.getConsent(identityId);
          const record = memoryIdentities.getVersion(resolved.scope, identityId, version);
          const decision = checkIdentityUse({ identityId, version: record, consent, operation });
          return { allowed: decision.allowed, reason: decision.reason };
        }
        const [consent, versions] = await Promise.all([
          resolveConsentSnapshot(identityId),
          listIdentityVersions(resolved, identityId),
        ]);
        const record = versions.find((v) => v.version === version) ?? null;
        const decision = checkIdentityUse({ identityId, version: record, consent, operation });
        return { allowed: decision.allowed, reason: decision.reason };
      },
    };

    const appPort = {
      getApp: async (appId: string) => {
        // Fixture lane: no frozen WorkflowApps exist locally (P05 owns
        // app freezing), so fanout reports the missing app honestly.
        if (lane) return null;
        const client = requireServiceClient();
        const { data, error } = await client
          .from("studio_v5_workflow_apps")
          .select("app_id,frozen_dag_hash,form_inputs")
          .eq("project_id", resolved.projectId)
          .eq("app_id", appId)
          .maybeSingle();
        if (error || !data) return null;
        const row = data as Record<string, unknown>;
        const inputs = (row["form_inputs"] as Array<{ name?: string; required?: boolean }> | null) ?? [];
        return {
          appId: String(row["app_id"]),
          frozenDagHash: String(row["frozen_dag_hash"]),
          inputs: inputs.map((f) => ({ name: String(f.name ?? ""), required: f.required !== false })),
        };
      },
    };

    const brief = campaign.brief as Record<string, unknown>;
    const fanout = await fanoutCampaignVariants(
      {
        campaign: {
          campaignId: campaign.campaignId,
          scope: resolved.scope,
          kind: campaign.kind as "marketing" | "influencer",
          title: campaign.title,
          templateId: campaign.templateId,
          templateVersion: campaign.templateVersion,
          appId: campaign.appId,
          brief: {
            audience: String(brief["audience"] ?? ""),
            hook: String(brief["hook"] ?? ""),
            cta: String(brief["cta"] ?? ""),
            caption: String(brief["caption"] ?? ""),
            soundtrackAssetId: (brief["soundtrackAssetId"] as string | null) ?? null,
            capIcu: asIcu(Number(brief["capIcu"] ?? 0)),
          },
          jobTreeId: campaign.jobTreeId,
          status: campaign.status as "draft",
          briefRevision: campaign.briefRevision,
          createdAt: campaign.updatedAt,
          updatedAt: campaign.updatedAt,
        },
        template,
        aspectIds,
        identities,
        costEstimateIcuByAspect: costEstimateIcuByAspect as Record<string, number>,
        now: new Date().toISOString(),
      },
      { identities: identityPort, apps: appPort },
    );

    if (lane) {
      fixtureSaveFanout(lane.composites, fanout);
    } else {
      for (const variant of fanout.admitted) {
        await upsertVariant({
          variantId: variant.variantId,
          campaignId: variant.campaignId,
          aspectId: variant.aspectId,
          identities: variant.identities,
          payloadHash: variant.payloadHash,
          estimatedCostIcu: variant.estimatedCostIcu,
        });
      }
    }
    return studioSuccess(
      {
        admitted: fanout.admitted,
        refused: fanout.refused,
        totalAdmittedIcu: fanout.totalAdmittedIcu,
        jobTreeId: campaign.jobTreeId,
      },
      undefined,
      201,
    );
  } catch (error) {
    return asCompositeFailure(error);
  }
}
