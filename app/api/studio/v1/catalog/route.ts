import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isTaskName, type TaskName } from "@ethen/studio-core/contracts";
import { projectCatalog } from "@ethen/studio-core/catalog/projection";
import { specToCatalogSource } from "@ethen/studio-core/catalog/source-local";
import type { QualificationAttestation } from "@ethen/studio-core/catalog/types";
import { resolveProjectScope } from "../_lib/supabase-data";
import {
  listAttestations,
  listDisabledEndpoints,
  listEndpointSpecs,
  listPausedEndpoints,
  listPriceRows,
} from "../_lib/supabase-catalog";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import {
  CatalogNotFoundError,
  getLocalCatalogVersion,
  listLocalCatalogSource,
  listLocalPrices,
} from "../_lib/memory-catalog";

export const dynamic = "force-dynamic";

/**
 * STUDIO_06 / V5 M2 — V1 catalog browse adapter. Both lanes (Supabase rows
 * and the local generated registry) project through the one
 * `projectCatalog` function; counts are derived live from the projection.
 * A fetch failure is an error, never an empty catalog.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const taskParam = request.nextUrl.searchParams.get("task");
    if (taskParam !== null && !isTaskName(taskParam)) {
      return studioError("VALIDATION_ERROR", `task is unknown: ${taskParam}.`);
    }
    const taskFilter = taskParam as TaskName | null;
    // The explicit loopback-only bypass has no Supabase service client. Give
    // it the checked-in generated registry through the same projection;
    // never promote catalog membership to executable availability.
    if (await isStudioLocalRequest()) {
      const source = await listLocalCatalogSource();
      const projection = projectCatalog(source, new Map(), await listLocalPrices(), new Set(), {
        catalogVersion: getLocalCatalogVersion(),
        taskFilter,
      });
      return studioSuccess({ catalog: projection });
    }
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const specs = await listEndpointSpecs(taskFilter ?? undefined);
    // Newest attestation wins (listAttestations orders attested_at desc).
    const attestations = new Map<string, QualificationAttestation>();
    for (const attestation of await listAttestations(specs.map((s) => s.endpointId))) {
      if (!attestations.has(attestation.endpointId)) attestations.set(attestation.endpointId, attestation);
    }
    const paused = await listPausedEndpoints();
    const disabled = await listDisabledEndpoints();
    const prices = await listPriceRows();
    const source = specs.map((spec) =>
      specToCatalogSource(spec, { enabled: !disabled.has(spec.endpointId) }),
    );
    const projection = projectCatalog(source, attestations, prices, paused, {
      catalogVersion: "supabase-live",
      taskFilter,
    });
    return studioSuccess({ catalog: projection });
  } catch (error) {
    // P01 catalog truth: a truly unreadable catalog file is a setup
    // condition, not a server crash. Other families are untouched (P03).
    if (error instanceof CatalogNotFoundError) {
      return studioError("SETUP_REQUIRED", "Model catalog file not found", undefined, { dependency: "catalog" });
    }
    const setup = setupRequiredResponse(error, "The model catalog needs the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Catalog listing failed.");
  }
}
