import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isAudioJobKind } from "@ethen/studio-core/server/audio";
import { resolveProjectScope } from "../../_lib/supabase-data";
import {
  AudioRouteError,
  createAudioProjectRecord,
  getAudioProjectDetail,
} from "../../_lib/supabase-audio";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureCreateAudioProject, fixtureGetAudioProjectDetail } from "../../_lib/audio-lane";

export const dynamic = "force-dynamic";

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function asLocale(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && BCP47.test(value) ? value : null;
}

/**
 * STUDIO_11 — V1 audio projects adapter. POST creates a batch audio run
 * (tts/transcribe/dub/changer) with explicit locales; GET reads one
 * project with stage lineage, speaker map, and latest transcript.
 * Stages admit through the shared /jobs runtime — this route never
 * executes or dispatches work itself.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!isAudioJobKind(kind)) return studioError("VALIDATION_ERROR", "kind must be tts, transcribe, dub, or changer.");
    if (body.sourceLanguage !== undefined && body.sourceLanguage !== null && asLocale(body.sourceLanguage) === null && body.sourceLanguage !== "") {
      return studioError("VALIDATION_ERROR", "sourceLanguage must be a BCP-47 tag such as 'en' or 'en-US'.");
    }
    if (body.targetLanguage !== undefined && body.targetLanguage !== null && asLocale(body.targetLanguage) === null && body.targetLanguage !== "") {
      return studioError("VALIDATION_ERROR", "targetLanguage must be a BCP-47 tag such as 'en' or 'en-US'.");
    }
    const sourceLanguage = asLocale(body.sourceLanguage ?? null);
    const targetLanguage = asLocale(body.targetLanguage ?? null);
    if (kind === "dub" && !targetLanguage) {
      return studioError("VALIDATION_ERROR", "Dubbing requires an explicit target language.");
    }
    if (kind === "dub" && sourceLanguage && sourceLanguage === targetLanguage) {
      return studioError("VALIDATION_ERROR", "Dub source and target languages must differ.");
    }
    if (await isStudioFixtureLane()) {
      const created = fixtureCreateAudioProject(localStores().audio, resolved, { kind, sourceLanguage, targetLanguage });
      return studioSuccess({
        audioProjectId: created.projectId,
        kind: created.kind,
        sourceLanguage: created.sourceLanguage,
        targetLanguage: created.targetLanguage,
        transcriptRevision: created.transcriptRevision,
        status: created.status,
      });
    }
    const created = await createAudioProjectRecord(resolved, { kind, sourceLanguage, targetLanguage });
    return studioSuccess({
      audioProjectId: created.projectId,
      kind: created.kind,
      sourceLanguage: created.sourceLanguage,
      targetLanguage: created.targetLanguage,
      transcriptRevision: created.transcriptRevision,
      status: created.status,
    });
  } catch (error) {
    if (error instanceof AudioRouteError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Audio projects need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Audio project creation failed.");
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const params = request.nextUrl.searchParams;
    const projectId = params.get("projectId");
    const audioProjectId = params.get("audioProjectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!audioProjectId) return studioError("VALIDATION_ERROR", "audioProjectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const detail = fixtureGetAudioProjectDetail(localStores().audio, resolved, audioProjectId);
      if (!detail) return studioError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
      return studioSuccess({
        audioProjectId: detail.projectId,
        kind: detail.kind,
        sourceLanguage: detail.sourceLanguage,
        targetLanguage: detail.targetLanguage,
        transcriptRevision: detail.transcriptRevision,
        status: detail.status,
        legacyVoiceJobId: detail.legacyVoiceJobId,
        stages: detail.stages,
        speakerMap: detail.speakerMap,
        transcript: detail.transcriptRevisionRow,
      });
    }
    const detail = await getAudioProjectDetail(resolved, audioProjectId);
    if (!detail) return studioError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);
    return studioSuccess({
      audioProjectId: detail.projectId,
      kind: detail.kind,
      sourceLanguage: detail.sourceLanguage,
      targetLanguage: detail.targetLanguage,
      transcriptRevision: detail.transcriptRevision,
      status: detail.status,
      legacyVoiceJobId: detail.legacyVoiceJobId,
      stages: detail.stages,
      speakerMap: detail.speakerMap,
      transcript: detail.transcriptRevisionRow,
    });
  } catch (error) {
    if (error instanceof AudioRouteError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Audio projects need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Audio project read failed.");
  }
}
