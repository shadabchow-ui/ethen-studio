import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse, StudioSetupError } from "@/lib/media/studio-setup";
import { grantProtectedDownload, MediaError } from "@ethen/studio-core/server/media";
import { evaluatePolicy, type PolicyAssetClass } from "@ethen/studio-core/server/policy";
import type { TaskName } from "@ethen/studio-core/contracts";
import { getAssetDetail, requireServiceClient, resolveProjectScope } from "../../_lib/supabase-data";
import { buildSupabasePolicyStores, recordDecision } from "../../_lib/supabase-policy";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";

export const dynamic = "force-dynamic";

/** Delivery policy runs under the originating task family (export.deliver is a composition, not a task). */
function taskForKind(kind: string): TaskName {
  if (kind === "image") return "image.generate";
  if (kind === "video") return "video.generate";
  if (kind === "music") return "music.generate";
  if (kind === "transcript") return "speech.transcribe";
  if (kind === "package") return "timeline.render";
  return "audio.generate";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_07 — V1 protected-download adapter. Fresh policy decision per
 * download, then a short-lived signed URL for the pinned version. The URL
 * is a delivery capability only — never persisted as the asset.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const assetId = asString(body.assetId);
    const kind = asString(body.kind);
    const contentHash = asString(body.contentHash);
    const version: unknown = (body as Record<string, unknown>).version;
    const ttlSeconds: unknown = (body as Record<string, unknown>).ttlSeconds;
    if (!assetId || typeof version !== "number" || !Number.isInteger(version) || !kind || !contentHash) {
      return studioError("VALIDATION_ERROR", "assetId, version, kind, and contentHash are required.");
    }
    if (typeof ttlSeconds !== "number" || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
      return studioError("VALIDATION_ERROR", "ttlSeconds must be an integer in (0, 3600].");
    }
    if (await isStudioFixtureLane()) {
      // Fixture lane: pins validate against the local asset lane; signing
      // stays SETUP_REQUIRED because the lane stages no download bytes.
      const detail = await getAssetDetail(resolved, assetId);
      const pinned = detail?.versions.find((row) => row.version === version);
      if (!detail || !pinned) return studioError("NOT_FOUND", "Version not found in this project scope.");
      if (pinned.sha256.toLowerCase() !== contentHash.toLowerCase()) {
        return studioError("CONFLICT", "Stored bytes no longer match the pinned content hash.");
      }
      const staged = await localStores().media.derivatives.listForAsset(assetId);
      if (staged.length > 0) {
        throw new StudioSetupError("object-storage", "Fixture derivatives are metadata-only; no bytes are staged.");
      }
      throw new StudioSetupError("object-storage", "The fixture lane stages no download bytes.");
    }
    const actorId = authorization.actorId ?? "unknown";
    const stores = buildSupabasePolicyStores();
    const grant = await grantProtectedDownload(
      {
        scope: resolved.scope,
        actorId,
        assetId,
        version: version as number,
        assetClass: kind,
        contentHash,
        ttlSeconds: ttlSeconds as number,
      },
      {
        policy: {
          check: async (check) => {
            const evaluation = await evaluatePolicy(stores, {
              scope: check.scope,
              actor: { actorId: check.actorId, roles: ["creator"] },
              task: taskForKind(check.assetClass),
              action: check.action,
              identityId: null,
              identityVersion: null,
              assetId: check.assetId,
              assetVersion: check.assetVersion,
              assetClass: check.assetClass as PolicyAssetClass,
              destination: null,
              contentReview: null,
              spendApproval: null,
            });
            await recordDecision(resolved, check.actorId, evaluation.decision);
            return {
              allowed: evaluation.decision.allowed,
              reasonCode: evaluation.decision.reasonCode,
              decisionId: evaluation.decision.decisionId,
              remediation: evaluation.decision.remediation,
            };
          },
        },
        sign: async (sign) => {
          const client = requireServiceClient();
          const { data: row, error: rowError } = await client
            .from("studio_v5_asset_versions")
            .select("storage_key, sha256")
            .eq("asset_id", sign.assetId)
            .eq("version", sign.version)
            .eq("project_id", resolved.projectId)
            .maybeSingle();
          if (rowError || !row) return { url: "", expiresAt: new Date().toISOString() };
          const typed = row as { storage_key: string; sha256: string };
          if (typed.sha256.toLowerCase() !== contentHash.toLowerCase()) {
            throw new MediaError("CONFLICT", "Stored bytes no longer match the pinned content hash.");
          }
          const { data: signed, error: signError } = await client.storage
            .from("project-objects")
            .createSignedUrl(typed.storage_key, sign.ttlSeconds);
          if (signError || !signed) throw new MediaError("INTERNAL", "Failed to sign the download URL.");
          return {
            url: signed.signedUrl,
            expiresAt: new Date(Date.now() + sign.ttlSeconds * 1000).toISOString(),
          };
        },
      },
    );
    if (!grant.url) return studioError("NOT_FOUND", "Version not found in this project scope.");
    return studioSuccess({
      url: grant.url,
      expiresAt: grant.expiresAt,
      contentHash: grant.contentHash,
      decisionId: grant.decisionId,
      explicitDownload: grant.explicitDownload,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Media needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof MediaError) {
      if (error.code === "POLICY_DENIED") return studioError("FORBIDDEN", error.message);
      if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
      if (error.code === "CONFLICT") return studioError("CONFLICT", error.message);
      return studioError("INTERNAL_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Download failed.");
  }
}
