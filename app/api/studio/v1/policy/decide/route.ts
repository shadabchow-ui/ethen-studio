import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { TASK_NAMES, type TaskName } from "@ethen/studio-core/contracts";
import { POLICY_ERROR_STATUS, evaluatePolicy } from "@ethen/studio-core/server/policy";
import type { PolicyAction } from "@ethen/studio-core/contracts";
import type { ContentReviewInput, PolicyAssetClass, SpendApprovalInput } from "@ethen/studio-core/server/policy";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { PolicyError, buildSupabasePolicyStores, recordDecision } from "../../_lib/supabase-policy";

export const dynamic = "force-dynamic";

const ACTIONS: readonly PolicyAction[] = ["generate", "export", "download", "share", "publish", "protected_serve"];
const ASSET_CLASSES: readonly string[] = ["image", "video", "audio", "music", "transcript", "document", "package"];
const REVIEW_STATES: readonly string[] = ["requested", "approved", "denied", "expired", "cancelled", "none"];

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * STUDIO_03 — V1 policy decision adapter. Authenticates, evaluates the
 * common policy decision against durable j03 records, audits the outcome,
 * and returns explicit axes plus readable remediation.
 *
 * Interim role mapping: any project-authorized member evaluates as creator
 * (baseline member capability). Admin/reviewer/viewer distinctions arrive
 * with the STUDIO_18 membership mapping; roles are never self-asserted.
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
    const actorId = authorization.actorId ?? session.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const task = asString(body.task);
    const action = asString(body.action);
    if (!task || !(TASK_NAMES as readonly string[]).includes(task)) {
      return studioError("VALIDATION_ERROR", "task is unknown.");
    }
    if (!action || !(ACTIONS as readonly string[]).includes(action)) {
      return studioError("VALIDATION_ERROR", "action is unknown.");
    }
    const assetClass = body.assetClass === undefined || body.assetClass === null
      ? null
      : asString(body.assetClass);
    if (assetClass !== null && !ASSET_CLASSES.includes(assetClass)) {
      return studioError("VALIDATION_ERROR", "assetClass is unknown.");
    }
    const destination = (body.destination ?? null) as Record<string, unknown> | null;
    const review = (body.contentReview ?? null) as Record<string, unknown> | null;
    const spend = (body.spendApproval ?? null) as Record<string, unknown> | null;
    if (review && !REVIEW_STATES.includes(asString(review.state) ?? "")) {
      return studioError("VALIDATION_ERROR", "contentReview.state is unknown.");
    }
    const contentReview: ContentReviewInput | null = review
      ? {
          state: (asString(review.state) ?? "none") as ContentReviewInput["state"],
          pinnedVersion: asString(review.pinnedVersion),
          currentVersion: asString(review.currentVersion),
        }
      : null;
    const spendApproval: SpendApprovalInput | null = spend
      ? {
          approved: spend.approved === true,
          approvalId: asString(spend.approvalId),
          capIcu: asNumber(spend.capIcu),
        }
      : null;

    const evaluation = await evaluatePolicy(buildSupabasePolicyStores(), {
      scope: resolved.scope,
      actor: { actorId, roles: ["creator"] },
      task: task as TaskName,
      action: action as PolicyAction,
      identityId: asString(body.identityId),
      identityVersion: asNumber(body.identityVersion),
      assetId: asString(body.assetId),
      assetVersion: asNumber(body.assetVersion),
      assetClass: assetClass as PolicyAssetClass | null,
      destination: destination
        ? {
            channel: asString(destination.channel),
            region: asString(destination.region),
            reviewTokenHash: asString(destination.reviewTokenHash),
          }
        : null,
      contentReview,
      spendApproval,
    });
    await recordDecision(resolved, actorId, evaluation.decision);
    return studioSuccess({
      state: evaluation.decision.allowed ? "ready" : "blocked",
      decision: evaluation.decision,
      axes: {
        consent: evaluation.consent,
        rights: evaluation.rights,
        publishAuthority: evaluation.publishAuthority,
        contentReview: evaluation.contentReview,
        spend: evaluation.spend,
      },
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Policy decisions need the Studio data service.");
    if (setup) return setup;
    if (error instanceof PolicyError) {
      const status = POLICY_ERROR_STATUS[error.code] ?? 500;
      const code = status === 404 ? "NOT_FOUND" : status === 403 ? "FORBIDDEN" : status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
      return studioError(code, error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Policy decision failed.");
  }
}
