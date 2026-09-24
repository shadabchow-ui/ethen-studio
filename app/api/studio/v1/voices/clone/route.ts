import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { StudioSetupError, setupRequiredResponse } from "@/lib/media/studio-setup";
import { TASK_NAMES, type TaskName } from "@ethen/studio-core/contracts";
import {
  IdentityStoreError,
  checkIdentityUse,
  validateCreationRequest,
  type CapabilityGate,
} from "@ethen/studio-core/server/identity";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { isStudioFixtureLane } from "../../_lib/local-lane";
import { listAttestations, listEndpointSpecs } from "../../_lib/supabase-catalog";
import {
  IdentityError,
  createIdentityWithVersion1,
  resolveConsentSnapshot,
} from "../../_lib/supabase-identity";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * STUDIO_10 — V1 voice Design/Clone adapter. Both flows validate
 * purpose, locale, and consent evidence (clone requires it), and both
 * proceed ONLY through a qualified capability: the named task must
 * have at least one live executable j06 attestation. The created
 * identity is still consent-gated at use — this route never mints a
 * usable binding by itself.
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
    if (!(authorization.actorId ?? session.actorId)) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const capability = asString(body.capability);
    if (!capability || !(TASK_NAMES as readonly string[]).includes(capability)) {
      return studioError("VALIDATION_ERROR", "capability must name a known task.");
    }
    const gate: CapabilityGate = async (task: TaskName) => {
      const now = new Date().toISOString();
      const specs = await listEndpointSpecs(task);
      const attestations = await listAttestations(specs.map((spec) => spec.endpointId));
      const live = attestations.find((attestation) => {
        const spec = specs.find((candidate) => candidate.endpointId === attestation.endpointId);
        return (
          spec !== undefined &&
          attestation.executable &&
          attestation.expiresAt > now &&
          attestation.adapterVersion === spec.adapterVersion &&
          attestation.schemaVersion === spec.schemaVersion &&
          attestation.priceVersion === spec.priceVersion
        );
      });
      if (!live) {
        return { task, executable: false, reason: `No qualified capability for ${task}: no live executable attestation. Design/Clone cannot proceed.` };
      }
      return { task, executable: true, reason: `Qualified via ${live.endpointId}.` };
    };
    const flow = asString(body.flow);
    if (flow !== "design" && flow !== "clone") {
      return studioError("VALIDATION_ERROR", "flow must be design or clone.");
    }
    if (await isStudioFixtureLane()) {
      // Voice creation needs a qualified speech capability plus a live
      // provider; the fixture tier runs neither. The form shows this
      // setup state instead of failing.
      const providerSetup = setupRequiredResponse(
        new StudioSetupError("provider"),
        flow === "clone" ? "Voice cloning needs a speech provider." : "Voice design needs a speech provider.",
      );
      if (providerSetup) return providerSetup;
    }
    let validated;
    try {
      validated = await validateCreationRequest(
        {
          flow,
          name: typeof body.name === "string" ? body.name : "",
          purpose: typeof body.purpose === "string" ? body.purpose : "",
          evidenceRef: body.evidenceRef === null || body.evidenceRef === undefined ? null : asString(body.evidenceRef),
          locale: typeof body.locale === "string" ? body.locale : "",
          capability: capability as TaskName,
          sourceAssetIds: Array.isArray(body.sourceAssetIds) ? body.sourceAssetIds.filter((id: unknown): id is string => typeof id === "string") : [],
        },
        gate,
      );
    } catch (error) {
      if (error instanceof IdentityStoreError) {
        if (error.code === "IDENTITY_EVIDENCE_REQUIRED") return studioError("CONSENT_REQUIRED", error.message);
        if (error.code === "IDENTITY_CAPABILITY_UNQUALIFIED") return studioError("PROVIDER_UNAVAILABLE", error.message);
        return studioError("VALIDATION_ERROR", error.message);
      }
      throw error;
    }
    const created = await createIdentityWithVersion1({
      resolved,
      kind: "voice",
      origin: validated.flow === "clone" ? "cloned" : "designed",
      name: validated.name,
      payload: {
        flow: validated.flow,
        purpose: validated.purpose,
        locale: validated.locale,
        capability: validated.capability,
        evidenceRef: validated.evidenceRef,
        sourceAssetIds: [...validated.sourceAssetIds],
      },
      consentGrantId: null,
    });
    const consent = await resolveConsentSnapshot(created.record.identityId);
    const use = checkIdentityUse({ identityId: created.record.identityId, version: created.version, consent, operation: validated.flow });
    return studioSuccess(
      {
        identity: {
          identityId: created.record.identityId,
          origin: created.record.origin,
          name: created.record.name,
          currentVersion: created.record.currentVersion,
        },
        use: { allowed: use.allowed, code: use.code, reason: use.reason },
      },
      crypto.randomUUID(),
      201,
    );
  } catch (error) {
    const setup = setupRequiredResponse(error, "Voices need the Studio data service.");
    if (setup) return setup;
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    return studioError("INTERNAL_ERROR", "Voice design/clone request failed.");
  }
}
