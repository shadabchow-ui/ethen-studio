import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CompositeError } from "@ethen/studio-core/server/composites";
import { asIcu } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { getCampaign, listReviews, listVariants, updateCampaignBrief } from "../../../_lib/supabase-composites";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import {
  fixtureGetCampaign,
  fixtureListReviews,
  fixtureListVariants,
  fixtureUpdateCampaignBrief,
} from "../../../_lib/composites-lane";

export const dynamic = "force-dynamic";

function asCompositeFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Campaigns need the Studio data service.");
  if (setup) return setup;
  if (error instanceof CompositeError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Composites request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value : null;
}

/**
 * STUDIO_15 — V1 campaign detail. GET returns campaign + variants + reviews.
 * PATCH edits the brief with CAS (expectedRevision); brief edits return the
 * campaign to draft and invalidate pinned approvals (kernel rule).
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
    const lane = (await isStudioFixtureLane()) ? localStores().composites : null;
    const campaign = lane ? fixtureGetCampaign(lane, resolved, campaignId) : await getCampaign(resolved, campaignId);
    if (!campaign) return studioError("NOT_FOUND", "Campaign was not found.");
    const [variants, reviews] = lane
      ? [fixtureListVariants(lane, resolved, campaignId), fixtureListReviews(lane, resolved, campaignId)]
      : await Promise.all([
        listVariants(resolved, campaignId),
        listReviews(resolved, campaignId),
      ]);
    return studioSuccess({ campaign, variants, reviews });
  } catch (error) {
    return asCompositeFailure(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }): Promise<Response> {
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
    const expectedRevision = typeof body.expectedRevision === "number" ? body.expectedRevision : Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) {
      return studioError("VALIDATION_ERROR", "expectedRevision is required.");
    }
    const lane = (await isStudioFixtureLane()) ? localStores().composites : null;
    const current = lane ? fixtureGetCampaign(lane, resolved, campaignId) : await getCampaign(resolved, campaignId);
    if (!current) return studioError("NOT_FOUND", "Campaign was not found.");
    if (current.status === "delivering" || current.status === "delivered") {
      return studioError("CONFLICT", `Campaign is ${current.status}; brief edits are closed.`);
    }
    const briefPatch = (body.brief ?? {}) as Record<string, unknown>;
    const capRaw = briefPatch["capIcu"] ?? current.brief["capIcu"];
    const capIcu = typeof capRaw === "number" ? capRaw : Number(capRaw);
    if (!Number.isInteger(capIcu) || capIcu < 0) return studioError("VALIDATION_ERROR", "brief.capIcu must be integer ICU.");
    if (lane) {
      const next = fixtureUpdateCampaignBrief(
        lane,
        resolved,
        campaignId,
        {
          audience: asOptionalString(briefPatch["audience"]) ?? String(current.brief["audience"] ?? ""),
          hook: asOptionalString(briefPatch["hook"]) ?? String(current.brief["hook"] ?? ""),
          cta: asOptionalString(briefPatch["cta"]) ?? String(current.brief["cta"] ?? ""),
          caption: asOptionalString(briefPatch["caption"]) ?? String(current.brief["caption"] ?? ""),
          soundtrackAssetId:
            briefPatch["soundtrackAssetId"] === null ? null : (asOptionalString(briefPatch["soundtrackAssetId"]) ?? (current.brief["soundtrackAssetId"] as string | null ?? null)),
          capIcu: asIcu(capIcu),
        },
        expectedRevision,
      );
      return studioSuccess({ campaign: next });
    }
    const next = await updateCampaignBrief(
      resolved,
      campaignId,
      {
        audience: asOptionalString(briefPatch["audience"]) ?? String(current.brief["audience"] ?? ""),
        hook: asOptionalString(briefPatch["hook"]) ?? String(current.brief["hook"] ?? ""),
        cta: asOptionalString(briefPatch["cta"]) ?? String(current.brief["cta"] ?? ""),
        caption: asOptionalString(briefPatch["caption"]) ?? String(current.brief["caption"] ?? ""),
        soundtrackAssetId:
          briefPatch["soundtrackAssetId"] === null ? null : (asOptionalString(briefPatch["soundtrackAssetId"]) ?? (current.brief["soundtrackAssetId"] as string | null ?? null)),
        capIcu,
      },
      expectedRevision,
    );
    return studioSuccess({ campaign: next });
  } catch (error) {
    return asCompositeFailure(error);
  }
}
