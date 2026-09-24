import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isTaskName, type TaskName } from "@ethen/studio-core/contracts";
import { queryCompatibleModels, type IdentityEndpointView } from "@ethen/studio-core/server/identity";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { getLocalCatalogVersion, listLocalCatalogSource, listLocalPrices } from "../../_lib/memory-catalog";
import { getMemoryIdentityRepository } from "../../_lib/memory-identity";
import { resolveProjectScope } from "../../_lib/supabase-data";
import {
  listAttestations,
  listDisabledEndpoints,
  listEndpointSpecs,
  listPausedEndpoints,
  listPriceRows,
} from "../../_lib/supabase-catalog";
import { projectCatalog } from "@ethen/studio-core/catalog/projection";
import { specToCatalogSource } from "@ethen/studio-core/catalog/source-local";
import type { QualificationAttestation } from "@ethen/studio-core/catalog/types";
import { IdentityError, getIdentityHead, listVoiceBindings } from "../../_lib/supabase-identity";

export const dynamic = "force-dynamic";

/**
 * STUDIO_10 — V1 compatible-model query. For one identity version +
 * task, explains every endpoint as compatible or excluded with
 * reasons. Voice and model stay independently selectable: this query
 * explains, never re-pins. Executability still requires live j06
 * qualification; no unattested endpoint is ever reported usable.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const params = request.nextUrl.searchParams;
    const projectId = params.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const identityId = params.get("identityId");
    if (!identityId) return studioError("VALIDATION_ERROR", "identityId is required.");
    const memory = (await isStudioLocalRequest()) ? getMemoryIdentityRepository() : null;
    const head = memory ? memory.getIdentity(resolved.scope, identityId) : await getIdentityHead(resolved, identityId);
    if (!head) return studioError("NOT_FOUND", `Identity ${identityId} was not found.`);
    const versionParam = params.get("version");
    const version = versionParam === null ? head.currentVersion : Number(versionParam);
    if (!Number.isInteger(version) || version < 1) {
      return studioError("VALIDATION_ERROR", "version must be a positive integer.");
    }
    const task = params.get("task");
    if (!task || !isTaskName(task)) return studioError("VALIDATION_ERROR", `task is unknown: ${task}.`);

    const specs = memory ? [] : await listEndpointSpecs(task);
    const attestations = new Map<string, QualificationAttestation>();
    if (!memory) {
      for (const attestation of await listAttestations(specs.map((spec) => spec.endpointId))) {
        if (!attestations.has(attestation.endpointId)) attestations.set(attestation.endpointId, attestation);
      }
    }
    const paused = memory ? new Set<string>() : await listPausedEndpoints();
    const disabled = memory ? new Set<string>() : await listDisabledEndpoints();
    const prices = memory ? await listLocalPrices() : await listPriceRows();
    const projection = memory
      ? projectCatalog(await listLocalCatalogSource(), attestations, prices, paused, {
          catalogVersion: getLocalCatalogVersion(),
          taskFilter: task as TaskName,
        })
      : projectCatalog(
          specs.map((spec) => specToCatalogSource(spec, { enabled: !disabled.has(spec.endpointId) })),
          attestations,
          prices,
          paused,
          { catalogVersion: "supabase-live", taskFilter: task as TaskName },
        );
    const byId = new Map(specs.map((spec) => [spec.endpointId, spec]));
    const views: IdentityEndpointView[] = projection.endpoints.map((endpoint) => ({
      endpointId: endpoint.endpointId,
      familyId: endpoint.familyId,
      providerId: endpoint.providerId,
      task: endpoint.task ?? task,
      label: endpoint.label,
      identityBinding: byId.get(endpoint.endpointId)?.identityBinding ?? false,
      executable: endpoint.executable,
      disabledReasons: [...endpoint.disabledReasons],
    }));
    const bindings = memory ? memory.listBindings(identityId, version) : await listVoiceBindings(resolved, identityId, version);
    const result = queryCompatibleModels({
      query: { scope: resolved.scope, identityId, identityVersion: version, task },
      bindings,
      endpoints: views,
    });
    return studioSuccess({
      identityId,
      identityVersion: version,
      task,
      candidates: result.candidates,
      bindings: result.bindings,
    });
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Identities need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Compatible-model query failed.");
  }
}
