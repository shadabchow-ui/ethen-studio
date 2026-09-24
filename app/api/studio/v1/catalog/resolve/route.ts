import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  DEFAULT_VERSION_PINS,
  isTaskName,
  type TaskName,
  type VersionPins,
} from "@ethen/studio-core/contracts";
import { routeAutoWith, routeExplicit, RouteError } from "@ethen/studio-core/catalog";
import type { EligibilityContext } from "@ethen/studio-core/catalog";
import { resolveProjectScope } from "../../_lib/supabase-data";
import {
  checkAllowance,
  listAttestations,
  listDisabledEndpoints,
  listEndpointSpecs,
  listPausedEndpoints,
} from "../../_lib/supabase-catalog";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { CatalogNotFoundError, listLocalCatalogSource } from "../../_lib/memory-catalog";
import { localSourceToSpecs, resolveLocalRoute } from "../../_lib/resolve-logic";

export const dynamic = "force-dynamic";

function asPins(value: unknown): VersionPins {
  if (!value || typeof value !== "object") return { ...DEFAULT_VERSION_PINS };
  const pins = value as Record<string, unknown>;
  return {
    taskSchemaVersion: typeof pins.taskSchemaVersion === "string" ? pins.taskSchemaVersion : DEFAULT_VERSION_PINS.taskSchemaVersion,
    endpointSchemaVersion: typeof pins.endpointSchemaVersion === "string" ? pins.endpointSchemaVersion : DEFAULT_VERSION_PINS.endpointSchemaVersion,
    priceVersion: typeof pins.priceVersion === "string" ? pins.priceVersion : DEFAULT_VERSION_PINS.priceVersion,
    adapterVersion: typeof pins.adapterVersion === "string" ? pins.adapterVersion : DEFAULT_VERSION_PINS.adapterVersion,
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * STUDIO_06 — V1 route adapter. Authenticates, resolves scope, and routes an
 * explicit pin or Auto selection through the shared catalog router. Explicit
 * pins never silently fall back; Auto records exclusions and rationale.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const task = typeof body.task === "string" ? body.task : "";
    if (!isTaskName(task)) {
      return studioError("VALIDATION_ERROR", `task is unknown: ${task || "(missing)"}.`);
    }
    const pins = asPins(body.pins);
    const parameters = asRecord(body.parameters);
    const providerParams = body.providerParams ?? null;
    const endpointId = typeof body.endpointId === "string" ? body.endpointId : null;
    const qualityRaw = typeof body.quality === "string" ? body.quality : "balanced";
    const quality = qualityRaw === "fast" || qualityRaw === "quality" || qualityRaw === "custom" ? qualityRaw : "balanced";
    const capIcu = typeof body.capIcu === "number" ? body.capIcu : null;

    // P01 — the explicit loopback-only bypass has no Supabase service client:
    // route over the checked-in generated registry through the shared router.
    // A qualified route wins; otherwise the caller gets an honest no-route
    // result (HTTP 200 with decision null), never a 503 for a request the
    // lane can answer truthfully.
    if (await isStudioLocalRequest()) {
      try {
        const outcome = resolveLocalRoute({
          specs: localSourceToSpecs(await listLocalCatalogSource()),
          task: task as TaskName,
          pins,
          parameters,
          providerParams,
          endpointId,
          quality,
          capIcu,
        });
        if (outcome.kind === "decision") return studioSuccess({ decision: outcome.decision });
        if (outcome.kind === "unknown-pin") return studioError("NOT_FOUND", outcome.message);
        return studioSuccess({ decision: null, reason: outcome.reason, excluded: [...outcome.excluded] });
      } catch (error) {
        if (error instanceof CatalogNotFoundError) {
          return studioError("SETUP_REQUIRED", "Model catalog file not found", undefined, { dependency: "catalog" });
        }
        throw error;
      }
    }

    const specs = await listEndpointSpecs();
    const disabled = await listDisabledEndpoints();
    const attestations = new Map(
      (await listAttestations(specs.map((s) => s.endpointId))).map((a) => [a.endpointId, a]),
    );
    const paused = await listPausedEndpoints();

    const tenantProviders: Record<string, { allowed: boolean; reason: string }> = {};
    const workspaceEndpoints: Record<string, { allowed: boolean; reason: string }> = {};
    for (const spec of specs) {
      const decision = await checkAllowance(resolved, spec.providerId, spec.endpointId);
      if (!decision.allowed) {
        if (decision.reason.startsWith("tenant provider")) {
          tenantProviders[spec.providerId] = decision;
        } else {
          workspaceEndpoints[spec.endpointId] = decision;
        }
      }
    }

    const base: EligibilityContext = {
      task: task as TaskName,
      pins,
      parameters,
      providerParams,
      identityBinding: null,
      tenantProviders,
      workspaceEndpoints,
      breakerPaused: paused,
      disabledEndpoints: disabled,
    };

    if (endpointId) {
      try {
        const decision = routeExplicit({ specs, attestations }, { ...base, endpointId, meterUnit: "task_unit", meterQuantity: 1 });
        return studioSuccess({ decision });
      } catch (error) {
        if (error instanceof RouteError) {
          const code = error.code === "PINNED_UNKNOWN" ? "NOT_FOUND" : "PROVIDER_UNAVAILABLE";
          return studioError(code, error.message);
        }
        throw error;
      }
    }

    try {
      const decision = routeAutoWith({ specs, attestations }, {
        ...base,
        intent: { quality, capIcu },
        availability: { configuredProviders: new Set() },
        meterUnit: "task_unit",
        meterQuantity: 1,
      });
      return studioSuccess({ decision });
    } catch (error) {
      if (error instanceof RouteError) {
        return studioError("PROVIDER_UNAVAILABLE", error.message);
      }
      throw error;
    }
  } catch (error) {
    const setup = setupRequiredResponse(error, "Model routing needs the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Route resolution failed.");
  }
}
