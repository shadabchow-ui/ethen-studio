import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CompositeError } from "@ethen/studio-core/server/composites";
import { asIcu } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { getTemplate, insertCampaign, listCampaigns } from "../../_lib/supabase-composites";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import {
  fixtureGetTemplate,
  fixtureInsertCampaign,
  fixtureListCampaigns,
} from "../../_lib/composites-lane";

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

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * STUDIO_15 — V1 campaign collection. POST binds a frozen template version
 * plus a frozen project WorkflowApp; GET lists heads. The brief carries the
 * integer ICU cap; fanout (variants route) never exceeds it.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const kind = asString(request.nextUrl.searchParams.get("kind"));
    if (kind && kind !== "marketing" && kind !== "influencer") {
      return studioError("VALIDATION_ERROR", "kind must be marketing or influencer.");
    }
    if (await isStudioFixtureLane()) {
      const lane = localStores();
      return studioSuccess({ campaigns: fixtureListCampaigns(lane.composites, resolved, kind as "marketing" | "influencer" | null) });
    }
    return studioSuccess({ campaigns: await listCampaigns(resolved, kind) });
  } catch (error) {
    return asCompositeFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const title = asString(body.title);
    const kind = asString(body.kind);
    const templateId = asString(body.templateId);
    const appId = asString(body.appId);
    const idempotencyKey = asString(body.idempotencyKey) ?? request.headers.get("Idempotency-Key");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!title) return studioError("VALIDATION_ERROR", "title is required.");
    if (kind !== "marketing" && kind !== "influencer") {
      return studioError("VALIDATION_ERROR", "kind must be marketing or influencer.");
    }
    if (!templateId) return studioError("VALIDATION_ERROR", "templateId is required.");
    if (!appId) return studioError("VALIDATION_ERROR", "appId (frozen WorkflowApp) is required.");
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const templateVersion = asNonNegativeInt(body.templateVersion);
    if (!templateVersion || templateVersion <= 0) return studioError("VALIDATION_ERROR", "templateVersion is required.");
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const template = lane ? fixtureGetTemplate(lane.composites, templateId, templateVersion) : await getTemplate(templateId, templateVersion);
    if (!template) return studioError("NOT_FOUND", `Template ${templateId} v${templateVersion} was not found.`);
    if (template.kind !== kind) return studioError("VALIDATION_ERROR", "Campaign kind must match its template kind.");

    const brief = (body.brief ?? {}) as Record<string, unknown>;
    const capIcu = asNonNegativeInt(brief["capIcu"]);
    if (capIcu === null) return studioError("VALIDATION_ERROR", "brief.capIcu (integer ICU) is required.");
    void asIcu(capIcu);
    if (lane) {
      const row = fixtureInsertCampaign(lane.composites, lane.keys, resolved, {
        kind: kind as "marketing" | "influencer",
        title,
        templateId,
        templateVersion,
        appId,
        brief: {
          audience: asOptionalString(brief["audience"]) ?? "",
          hook: asOptionalString(brief["hook"]) ?? "",
          cta: asOptionalString(brief["cta"]) ?? "",
          caption: asOptionalString(brief["caption"]) ?? "",
          soundtrackAssetId: asOptionalString(brief["soundtrackAssetId"]),
          capIcu: asIcu(capIcu),
        },
        idempotencyKey,
      });
      return studioSuccess({ campaign: row }, undefined, 201);
    }
    const row = await insertCampaign({
      scope: resolved,
      kind,
      title,
      templateId,
      templateVersion,
      appId,
      brief: {
        audience: asOptionalString(brief["audience"]) ?? "",
        hook: asOptionalString(brief["hook"]) ?? "",
        cta: asOptionalString(brief["cta"]) ?? "",
        caption: asOptionalString(brief["caption"]) ?? "",
        soundtrackAssetId: asOptionalString(brief["soundtrackAssetId"]),
        capIcu,
      },
      idempotencyKey,
    });
    return studioSuccess({ campaign: row }, undefined, 201);
  } catch (error) {
    return asCompositeFailure(error);
  }
}
